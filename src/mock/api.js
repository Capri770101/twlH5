import { normalizeAgentAssetUrl as normalizeAgentAssetUrlPure } from '@/utils/agentAsset'
import mockData from './data'
import { getReviewByOrder, getReviewsByProduct } from '@/store'

// ===== 真实后端数据层（MySQL 经由 Node 后端 /api 代理）=====
// 默认开启：优先调 /api，失败（后端未起 / DB 不可达 / 无权限）自动回退下方 mock，保证页面永远有数据
const REAL_API_ENABLED = import.meta.env.VITE_USE_REAL_API !== 'false'
// 🔴 生产构建**禁止静默回退演示数据**（2026-09-18 外部审计 P0-5）。
//    假订单/假门店/假商品会被用户当成真的（且假图全是 404），比"页面空着"危险得多；
//    支付更糟：回退会返回伪造的 weixin:// 支付链接，用户拉起一个报错的收银台。
//    仅 dev，或显式 VITE_ALLOW_MOCK_FALLBACK=true 时保留兜底，方便无后端联调。
const ALLOW_MOCK_FALLBACK = !!import.meta.env.DEV || import.meta.env.VITE_ALLOW_MOCK_FALLBACK === 'true'
const API_BASE = import.meta.env.VITE_API_BASE || '/api'
function authHeaders(token) {
  const t = token || localToken()
  return t && !t.startsWith('mock_') ? { Authorization: 'Bearer ' + t } : {}
}
async function realApi(path, params, token) {
  const base = (typeof location !== 'undefined' && location.origin) || ''
  const url = new URL(API_BASE + path, base)
  if (params) for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v != null) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, { headers: { Accept: 'application/json', ...authHeaders(token) } })
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    throw httpError((j && j.error) || ('api ' + res.status), res.status)
  }
  const j = await res.json()
  if (j && j.error) throw new Error(j.error)
  return j
}

/** 带上 HTTP 状态码的错误（调用方据此区分「鉴权失败」与「业务失败/网络失败」） */
function httpError(message, status) {
  const e = new Error(message)
  e.status = status
  if (status === 401) clearStaleAuth() // 401 = 本地登录态已失效（过期/换密钥）→ 清掉，避免死循环
  return e
}

// POST 到真实后端（支付等写操作）
async function realPost(path, body, token) {
  const base = (typeof location !== 'undefined' && location.origin) || ''
  const url = new URL(API_BASE + path, base)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body || {})
  })
  if (!res.ok) {
    const j = await res.json().catch(() => null)
    throw httpError((j && j.error) || ('api ' + res.status), res.status)
  }
  const j = await res.json()
  if (j && j.error) throw new Error(j.error)
  return j
}

// 模拟网络延迟
const delay = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms))

// ===== 微信支付（服务商 + 分账） =====
// 复用跳舞兰服务商号 + 各店 sub_mchid；下单带 profit_sharing=true 触发自动分账。
// 真实后端未起时回退 mock，保证下单流程可演示。
export async function payOrder({ shopId, outTradeNo, amountFen, description, openid, tradeType }) {
  if (REAL_API_ENABLED) {
    try {
      return await realPost('/pay/order', { shopId, outTradeNo, amountFen, description, openid, tradeType })
    } catch (e) {
      if (!ALLOW_MOCK_FALLBACK) throw e // /pay/order：生产不回退演示数据
      console.warn('[api] /pay/order 真实接口失败，回退 mock：', e && e.message)
    }
  }
  await delay(500)
  const inWeChat = typeof navigator !== 'undefined' && /micromessenger/i.test(navigator.userAgent)
  if (tradeType === 'NATIVE') {
    // PC 扫码支付：真实后端会额外返回 qrDataUrl（服务端生成二维码）；mock 只给 code_url
    return { tradeType: 'NATIVE', code_url: 'mockpay://dev-only-not-payable/' + outTradeNo, qrDataUrl: '' }
  }
  if (tradeType === 'H5' || !inWeChat) {
    // 外部浏览器：返回 h5_url（mock 仅占位，实际由后端返回微信收银台链接）
    return { tradeType: 'H5', h5_url: 'mockpay://dev-only-not-payable/' + outTradeNo }
  }
  // 微信内：返回 JSAPI 调起参数（mock 签名为占位，仅演示流程）
  return {
    tradeType: 'JSAPI',
    appId: 'wxMock',
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: 'mock' + Date.now(),
    package: 'prepay_id=dev-only-not-payable_' + outTradeNo,
    signType: 'RSA',
    paySign: 'mock'
  }
}

export async function queryPayOrder(outTradeNo, subMchid) {
  if (REAL_API_ENABLED) {
    try {
      return await realApi(`/pay/query/${encodeURIComponent(outTradeNo)}`, { subMchid: subMchid || '' })
    } catch (e) {
      if (!ALLOW_MOCK_FALLBACK) throw e // /pay/query：生产不回退演示数据
      console.warn('[api] /pay/query 失败，回退 mock：', e && e.message)
    }
  }
  await delay(200)
  return { trade_state: 'SUCCESS', out_trade_no: outTradeNo }
}

/**
 * 按 shopId 查支付状态（PC 扫码支付面板轮询用；等价于上面但不必知道 sub_mchid）。
 * 注意：后端 /api/pay/query 在 trade_state=SUCCESS 时会就地补记订单（回调丢失自愈），
 * 所以这个调用同时也是「催一次落库」。
 */
export async function payQueryStatus(outTradeNo, shopId) {
  if (REAL_API_ENABLED) {
    return await realApi(`/pay/query/${encodeURIComponent(outTradeNo)}`, { shopId: shopId || '' })
  }
  await delay(200)
  return { trade_state: 'NOTPAY', out_trade_no: outTradeNo }
}


// ===== 轻量 TTL 缓存：分类/店铺这类低频变化的数据，避免每次进页都重拉 =====
const _ttlCache = new Map()
function cached(key, ttlMs, loader) {
  const hit = _ttlCache.get(key)
  const now = Date.now()
  if (hit && now - hit.at < ttlMs) return hit.promise
  const promise = Promise.resolve()
    .then(loader)
    .catch(err => { _ttlCache.delete(key); throw err }) // 失败不缓存，下次可重试
  _ttlCache.set(key, { at: now, promise })
  return promise
}

// ===== 已开通城市（城市选择器数据源）=====
// 城市是浏览维度：先选城市 → 再按城市筛门店与商品（与小程序一致）。
// 商家后端下单会硬校验「收货城市 == 门店服务城市」，不按城市筛选会导致付款后被拒单。
export function getCities() {
  return cached('cities', 5 * 60 * 1000, async () => {
    if (REAL_API_ENABLED) {
      try {
        const rows = await realApi('/cities')
        if (Array.isArray(rows) && rows.length) return rows
      } catch (e) { if (!ALLOW_MOCK_FALLBACK) throw e; console.warn('[api] /cities 真实接口失败，回退 mock：', e && e.message) }
    }
    if (!ALLOW_MOCK_FALLBACK) return []
    const m = new Map()
    for (const s of mockData.shops) {
      const c = String((s && s.city) || '').trim()
      if (c) m.set(c, (m.get(c) || 0) + 1)
    }
    return Array.from(m, ([name, shops]) => ({ name, shops })).sort((a, b) => b.shops - a.shops)
  })
}

// ===== 首页 =====
export function getHomeIndex(city = '') {
  const c = String(city || '').trim()
  return cached('home:' + c, 60 * 1000, () => getHomeIndexReal(c))
}

async function getHomeIndexReal(city = '') {
  if (REAL_API_ENABLED) {
    try { return await realApi('/home', city ? { city } : undefined) } catch (e) { if (!ALLOW_MOCK_FALLBACK) throw e; console.warn('[api] /home 真实接口失败，回退 mock：', e && e.message) }
  }
  const data = { ...mockData.homeData }
  data.recommendFlowers = mockData.enrichFlowerList(mockData.flowers.slice(0, 6))
  data.nearbyShops = mockData.shops.slice(0, 4).map(shop => ({
    ...shop,
    distanceKm: parseFloat(shop.distance) || null
  }))
  await delay()
  return data
}

// ===== 花束详情 =====
export async function getFlowerDetail(id) {
  if (REAL_API_ENABLED) {
    try { return await realApi('/flowers/' + encodeURIComponent(id)) } catch (e) { if (!ALLOW_MOCK_FALLBACK) throw e; console.warn('[api] /flowers/:id 真实接口失败，回退 mock：', e && e.message) }
  }
  const flower = mockData.flowers.find(f => f.id === id)
  await delay()
  if (!flower) return null
  const enriched = mockData.enrichFlowerItem(flower)

  // 详情页特有衍生字段（对应 detail.js 中的处理）
  const price = flower.price || 0
  const originalPrice = flower.originalPrice || 0
  const hasDiscount = originalPrice > price
  const discountRate = hasDiscount
    ? (Math.round((price / originalPrice) * 100) / 10).toFixed(1)
    : '0'

  return {
    ...enriched,
    hasDiscount,
    discountRate,
    displayTags: flower.tags || [],
    materialItems: flower.flowers || [],
    sceneItems: flower.tags || [],
    meaningText: flower.flowerMeaning || '',
    descriptionText: flower.description || '',
    serviceItems: ['坏单包退', '缺枝补发', '准时送达', '花材新鲜'],
    deliveryText: '同城配送'
  }
}

// ===== 分类 =====
export function getCategories() {
  return cached('categories', 5 * 60 * 1000, async () => {
    if (REAL_API_ENABLED) {
      try { return await realApi('/categories') } catch (e) { if (!ALLOW_MOCK_FALLBACK) throw e; console.warn('[api] /categories 真实接口失败，回退 mock：', e && e.message) }
    }
    await delay(80)
    return mockData.categories
  })
}

// ===== 花束列表（分类/排序/分页复用） =====
export async function getFlowerList({ categoryId = '', sort = 'default', page = 1, pageSize = 10, city = '' } = {}) {
  if (REAL_API_ENABLED) {
    try { return await realApi('/flowers', { categoryId, sort, page, pageSize, city }) } catch (e) { if (!ALLOW_MOCK_FALLBACK) throw e; console.warn('[api] /flowers 真实接口失败，回退 mock：', e && e.message) }
  }
  let list = [...mockData.flowers]
  if (categoryId) list = list.filter(f => f.categoryId === categoryId)
  if (sort === 'sales') list.sort((a, b) => b.sales - a.sales)
  if (sort === 'price_asc') list.sort((a, b) => a.price - b.price)
  if (sort === 'price_desc') list.sort((a, b) => b.price - a.price)
  const start = (page - 1) * pageSize
  await delay()
  return {
    list: mockData.enrichFlowerList(list.slice(start, start + pageSize)),
    total: list.length,
    hasMore: start + pageSize < list.length
  }
}

// ===== 订单 =====
function decorateOrder(o) {
  // 后端尚无评价表，先并上本地保存的评价（本地评价后即视为已评价）
  const rv = getReviewByOrder(o.id)
  return {
    ...o,
    _hasReview: !!o.review || !!rv,
    _review: rv || null,
    reviewRating: o.reviewRating || (rv && rv.rating) || 0,
    reviewTags: o.reviewTags || (rv && rv.tags) || [],
    review: o.review || (rv && rv.content) || '',
    _canDelete: ['completed', 'refunded', 'refund_failed', 'cancelled'].includes(o.status),
    // refund_failed 允许重新申请：上一次没退成功，且退款单号固定（微信侧幂等），不会重复出账
    _canRefund: ['pending', 'making', 'delivering', 'refund_failed'].includes(o.status),
    _totalQty: (o.items || []).reduce((s, i) => s + (i.quantity || 1), 0)
  }
}

// ---------- H5 用户身份（过渡：匿名访客 guest；微信登录物料到位后自动升级） ----------
function localToken() {
  try { return localStorage.getItem('twd_token') || '' } catch (e) { return '' }
}
function localUser() {
  try { return JSON.parse(localStorage.getItem('twd_userInfo') || 'null') } catch (e) { return null }
}
function genGuestId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return 'g_' + crypto.randomUUID().replace(/-/g, '').slice(0, 22)
    }
  } catch (e) { /* fallthrough */ }
  return 'g_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6)
}

// 保证存在可用身份：有效 token 直接复用；否则向后端注册/登录 guest
// 返回 { userInfo, token }；后端不可达时返回 { offline:true }
export async function ensureGuestAuth() {
  const token = localToken()
  const ui = localUser()
  // 本地判定可用的 token + 有 user.id → 直接复用（手机号/微信/guest 登录均适用）。
  // ⚠️ 必须用 isTokenUsable 而非只看「非 mock_」：否则残留的过期 token 会被当成有效身份
  //    一直复用，导致后续需要鉴权的接口全部失败。
  if (isTokenUsable(token) && ui && ui.id) {
    return { userInfo: ui, token }
  }
  let guestId = ''
  try { guestId = localStorage.getItem('twd_guest_id') || '' } catch (e) { /* ignore */ }
  if (!guestId) {
    guestId = genGuestId()
    try { localStorage.setItem('twd_guest_id', guestId) } catch (e) { /* ignore */ }
  }
  if (REAL_API_ENABLED) {
    try {
      const d = await realPost('/auth/guest', { guestId })
      const info = {
        id: String((d.user && d.user.id) || ''),
        nickname: (d.user && d.user.nickname) || '微信用户',
        avatar: (d.user && d.user.avatar) || '',
        phone: '',
        guest: true
      }
      try {
        localStorage.setItem('twd_token', d.token)
        localStorage.setItem('twd_userInfo', JSON.stringify(info))
      } catch (e) { /* ignore */ }
      return { userInfo: info, token: d.token }
    } catch (e) {
      console.warn('[api] guest 身份注册失败，回退离线：', e && e.message)
    }
  }
  return { offline: true }
}

export async function getOrderList(status = 'all') {
  if (REAL_API_ENABLED) {
    try {
      const a = await ensureGuestAuth()
      if (!a.offline) {
        // status 由后端翻译（new=待付款→DB pending；pending=待接单→DB paid；review/refund 特判）
        const d = await realApi('/orders', { status, page: 1, pageSize: 50 }, a.token)
        return (d.list || []).map(decorateOrder)
      }
    } catch (e) {
      if (!ALLOW_MOCK_FALLBACK) throw e // /orders：生产不回退演示数据
      console.warn('[api] /orders 真实接口失败，回退 mock：', e && e.message)
    }
  }
  let list = mockData.orders.map(decorateOrder)
  if (status === 'refund') {
    list = list.filter(o => ['refunding', 'refunded', 'refund_failed'].includes(o.status))
  } else if (status === 'review') {
    list = list.filter(o => o.status === 'completed' && !o._hasReview)
  } else if (status && status !== 'all') {
    list = list.filter(o => o.status === status)
  }
  await delay()
  return list
}

export async function getOrderDetail(id) {
  if (REAL_API_ENABLED) {
    try {
      const a = await ensureGuestAuth()
      if (!a.offline) {
        const d = await realApi('/orders/' + encodeURIComponent(id), null, a.token)
        return decorateOrder(d)
      }
    } catch (e) {
      // 真实库里没有这笔单（如 mock 单号/他人订单）→ 返回 null，不混入 mock 数据
      if (/not found|404/i.test(String(e && e.message))) return null
      if (!ALLOW_MOCK_FALLBACK) throw e // /orders/:id：生产不回退演示数据
      console.warn('[api] /orders/:id 真实接口失败，回退 mock：', e && e.message)
    }
  }
  const order = mockData.orders.find(o => o.id === id)
  await delay()
  return order ? decorateOrder(order) : null
}

// ---------- 申请退款（服务商分账退款，调 /pay/refund） ----------
// 真实分支：ensureGuestAuth 拿 token → POST /pay/refund（outTradeNo/reason/amountFen/shopId）
// 申请退款：走订单侧接口落库并返回服务端最终状态；仅后端完全不可达时才回退离线占位。
export async function refundOrder(orderId, { reason, amountFen } = {}) {
  if (REAL_API_ENABLED) {
    const a = await ensureGuestAuth()
    if (!a.offline) {
      // 走「订单侧」的申请退款接口：它会落库（状态 + 退款单号/金额/原因/时间）并返回最终状态。
      // ⚠️ 两处历史坑，别再退回去：
      //   ① 以前调 /pay/refund —— 那是只出账、不写订单状态的底层接口，
      //      导致「钱真退了、列表里还是已支付、还能反复申请退款」；
      //   ② 以前把异常 catch 掉再乐观返回 {ok:true} —— 后端失败用户也看到「提交成功」。
      //      现在失败必须抛出去，让页面提示真实原因。
      return await realPost('/orders/' + encodeURIComponent(orderId) + '/refund', {
        reason: reason || '',
        amountFen: Math.round(Number(amountFen) || 0)
      }, a.token)
    }
  }
  await delay(300)
  return { ok: true, offline: true, status: 'refunding', statusText: '退款中' }
}

/** 提交订单：真实后端落库（快照+服务端计价），返回新订单号 */
export async function createOrder(payload) {
  if (REAL_API_ENABLED) {
    try {
      const a = await ensureGuestAuth()
      if (!a.offline) {
        const addr = (payload.address && typeof payload.address === 'object') ? payload.address : {}
        const d = await realPost('/orders', {
          shopId: payload.shopId || '',
          shopName: payload.shopName || '',
          items: (payload.items || []).map(i => ({
            id: i.id,
            name: i.name,
            subtitle: i.subtitle || '',
            image: i.image || '',
            price: i.price || 0,
            quantity: i.quantity || 1
          })),
          address: {
            name: addr.name || '',
            phone: addr.phone || '',
            // 兼容两种地址产物：优先 region，其次由省市区拼出（早期 AddressPicker 无 region）
            region: addr.region || [addr.province, addr.city, addr.district].filter(Boolean).join(''),
            detail: addr.detail || ''
          },
          expectDeliveryTime: payload.expectDeliveryTime || '',
          pickupMethod: payload.pickupMethod || 'delivery',
          pickupName: payload.pickupName || '',
          pickupPhone: payload.pickupPhone || '',
          cardContent: payload.cardContent || '',
          remark: payload.remark || ''
        }, a.token)
        return { id: d.id, status: d.status || 'new' }
      }
    } catch (e) {
      if (!ALLOW_MOCK_FALLBACK) throw e // /orders：生产不回退演示数据
      console.warn('[api] /orders 真实接口失败，回退 mock：', e && e.message)
    }
  }
  await delay(400)
  const id = '20260' + String(Date.now()).slice(-6)
  const order = {
    id,
    status: 'pending',
    statusText: '待付款',
    items: payload.items.map(i => ({
      id: i.id,
      name: i.name,
      subtitle: i.subtitle,
      image: i.image,
      price: i.price,
      quantity: i.quantity
    })),
    totalPrice: payload.totalPrice,
    createTime: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    address: payload.address,
    expectDeliveryTime: payload.expectDeliveryTime,
    pickupMethod: payload.pickupMethod,
    cardContent: payload.cardContent,
    remark: payload.remark
  }
  mockData.orders.unshift(order)
  return { id, status: 'pending' }
}

/** 取消订单（仅待付款可取消；真实后端落库） */
export async function cancelOrder(id) {
  if (REAL_API_ENABLED) {
    try {
      const a = await ensureGuestAuth()
      if (!a.offline) {
        const d = await realPost('/orders/' + encodeURIComponent(id) + '/cancel', {}, a.token)
        if (d && d.ok === false) throw new Error(d.error || '取消失败')
        return true
      }
    } catch (e) {
      console.warn('[api] 取消订单失败：', e && e.message)
      throw e
    }
  }
  const order = mockData.orders.find(o => o.id === id)
  if (order) {
    order.status = 'cancelled'
    order.statusText = '已取消'
  }
  await delay(200)
  return true
}

// ===== 配送/取货时间可选日期 =====
export function getDeliveryDates() {
  const slots = ['尽快送达（约1小时）', '上午 9:00-12:00', '下午 14:00-18:00', '晚上 18:00-21:00']
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const today = new Date()
  return [0, 1, 2].map(offset => {
    const d = new Date(today.getTime() + offset * 86400000)
    const label = offset === 0 ? '今天' : offset === 1 ? '明天' : '后天'
    const dateLabel = `${label} ${d.getMonth() + 1}/${d.getDate()} ${week[d.getDay()]}`
    const daySlots = (offset === 0 ? slots : slots.slice(1)).map(timeSlot => ({
      timeSlot,
      fullText: `${dateLabel} ${timeSlot}`
    }))
    return { dateLabel, slots: daySlots }
  })
}
// ===== 店铺详情 =====
function prepareShopTrustInfo(shop) {
  const next = { ...shop }
  const name = String(shop.name || '')
  const rating = Number(shop.rating || 0)
  const ratingCount = Number(shop.ratingCount || 0)
  next.hasReviews = ratingCount > 0 && rating > 0
  next.displayRating = next.hasReviews ? rating.toFixed(1) + ' ›' : '暂无'
  next.reviewTabText = ratingCount > 0 ? `评价 ${ratingCount}` : '评价'
  const sales = Number(shop.monthSales || 0)
  next.displaySales = sales > 0 ? `月售${sales}` : (shop.flowers ? `在售${shop.flowers.length}款` : '近期上新')
  // 商家特色标签（与小程序 prepareShopTrustInfo 同款启发式）
  const isQianbaidu = name.indexOf('千百度') >= 0
  const isXingfu = name.indexOf('幸福') >= 0
  const isHuameijia = name.indexOf('花美家') >= 0
  next.featureLabel = isQianbaidu ? '经营年限' : '商家特色'
  next.featureValue = isQianbaidu ? '18年老店' : '极速开票'
  const setDefault = (k, v) => { if (!String(next[k] || '').trim()) next[k] = v }
  if (isQianbaidu) {
    setDefault('brandSlogan', '千百度花坊 · 20年匠心花艺 · 用一束花表达心意')
    setDefault('ipTitle', '主理人任大姐')
    setDefault('ipText', '20年严选好花材，热情豪爽，把每一束花都包扎得体面又有心意。')
    setDefault('serviceNote', '尊贵的客人，如有订花、配送、自取或定制需求，任大姐竭诚为您服务。')
  } else if (isXingfu) {
    setDefault('brandSlogan', '幸福花店 · 始于2013年 · 用鲜花记录每一份幸福')
    setDefault('ipTitle', '主理人江燕')
    setDefault('ipText', '2013年开始深耕花艺，审美在线，包出来的花大气又洋气，认真挑花、细心搭配，把每一份祝福都做得有质感。')
    setDefault('serviceNote', '亲爱的客人，如需订花、配送、自取或定制花礼，江燕会用心为您安排。')
  } else if (isHuameijia) {
    setDefault('brandSlogan', '花美家AI花店 · 懂场景也懂心意的鲜花服务')
    setDefault('ipTitle', '花美家花艺顾问')
    setDefault('ipText', '根据场景和预算推荐合适花礼，注重配色、包装和送达体验，让表达更省心。')
    setDefault('serviceNote', '尊敬的客人，如有订花、搭配、配送或定制需求，花美家花艺顾问随时为您服务。')
  } else {
    setDefault('brandSlogan', `${name || '花店'} · 精选花材 · 用心服务每一份托付`)
    setDefault('ipTitle', '花店主理人')
    setDefault('ipText', '严选新鲜花材，认真搭配包装，把每一份心意稳妥送到。')
    setDefault('serviceNote', '尊敬的客人，如有订花、配送、自取或定制需求，我们竭诚为您服务。')
  }
  return next
}

export async function getShopDetail(id) {
  if (REAL_API_ENABLED) {
    try { return await realApi('/shops/' + encodeURIComponent(id)) } catch (e) { if (!ALLOW_MOCK_FALLBACK) throw e; console.warn('[api] /shops/:id 真实接口失败，回退 mock：', e && e.message) }
  }
  const shopRaw = mockData.shops.find(s => s.id === id)
  await delay()
  if (!shopRaw) return null
  const shop = prepareShopTrustInfo(shopRaw)
  const allFlowers = (shopRaw.flowers || [])
    .map(fid => mockData.flowers.find(f => f.id === fid))
    .filter(Boolean)
  const flowers = mockData.enrichFlowerList(allFlowers)
  const featured = flowers.slice(0, 3)
  // 商品分类（用于筛选 chips）
  const catMap = new Map()
  flowers.forEach(f => {
    const cid = f.categoryId || 'other'
    if (!catMap.has(cid)) {
      const cat = mockData.categories.find(c => c.id === cid)
      catMap.set(cid, { id: cid, name: cat ? cat.name : '其他' })
    }
  })
  const categories = [{ id: '', name: '全部' }, ...Array.from(catMap.values())]
  return { shop, flowers, featured, categories }
}

const SAMPLE_REVIEWS = [
  { user: '微信用户****8821', rating: 5, content: '花很新鲜，包装精致，配送准时，朋友收到很开心！', date: '2026-08-30', tags: ['包装精美', '配送快'] },
  { user: '微信用户****3360', rating: 5, content: '花艺师审美在线，配色高级，下次还来。', date: '2026-08-22', tags: ['花材新鲜'] },
  { user: '微信用户****1190', rating: 4, content: '整体满意，希望可以多几个包装颜色选择。', date: '2026-08-15', tags: ['服务好'] }
]

export async function getShopReviews(shopId) {
  if (REAL_API_ENABLED) {
    try { return await realApi('/shops/' + encodeURIComponent(shopId) + '/reviews') } catch (e) { if (!ALLOW_MOCK_FALLBACK) throw e; console.warn('[api] /shops/:id/reviews 真实接口失败，回退 mock：', e && e.message) }
  }
  await delay(120)
  return SAMPLE_REVIEWS
}

function fmtReviewDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 商品评价：本地（本人评价，最新在前）+ 后端（若已提供接口）+ 示例评价兜底
 * 后端暂无 /flowers/:id/reviews，失败时静默降级
 */
export async function getProductReviews(productId) {
  const local = getReviewsByProduct(productId).map(r => ({
    user: r.anonymous ? '匿名用户' : '我',
    rating: r.rating,
    content: r.content || '此用户没有填写评价',
    date: fmtReviewDate(r.createdAt),
    tags: r.tags || [],
    mine: true
  }))
  if (REAL_API_ENABLED) {
    try {
      const remote = await realApi('/flowers/' + encodeURIComponent(productId) + '/reviews')
      if (Array.isArray(remote) && remote.length) return [...local, ...remote]
    } catch (e) { /* 后端暂无商品评价接口，静默走兜底 */ }
  }
  await delay(80)
  return [...local, ...SAMPLE_REVIEWS]
}

// 全部店铺列表（首页「更多花店」入口；可传 city 只看该城门店）
export function getShopList(city = '') {
  const c = String(city || '').trim()
  return cached('shops:' + c, 5 * 60 * 1000, async () => {
    if (REAL_API_ENABLED) {
      try { return await realApi('/shops', c ? { city: c } : undefined) } catch (e) { if (!ALLOW_MOCK_FALLBACK) throw e; console.warn('[api] /shops 真实接口失败，回退 mock：', e && e.message) }
    }
    await delay(140)
    return mockData.shops
  })
}

export async function searchAll(keyword, city = '') {
  if (REAL_API_ENABLED) {
    try { return await realApi('/search', { q: keyword, city }) } catch (e) { if (!ALLOW_MOCK_FALLBACK) throw e; console.warn('[api] /search 真实接口失败，回退 mock：', e && e.message) }
  }
  const kw = (keyword || '').trim().toLowerCase()
  if (!kw) return { flowers: [], shops: [] }
  const flowers = mockData.flowers.filter(f =>
    (f.name || '').toLowerCase().includes(kw) ||
    (f.subtitle || '').toLowerCase().includes(kw) ||
    (f.tags || []).some(t => t.toLowerCase().includes(kw))
  )
  const shops = mockData.shops.filter(s =>
    (s.name || '').toLowerCase().includes(kw) ||
    (s.address || '').toLowerCase().includes(kw)
  )
  await delay()
  return { flowers: mockData.enrichFlowerList(flowers), shops }
}

// ===== 登录（真后端 /api/auth/* 优先；离线回退 mock） =====
// 账号统一：guestId（匿名设备身份）+ bindUserId（当前登录 user.id，仅无手机号壳时携带）
// 后端按「已绑手机号的行优先」把候选行并入同一账号（见 server/src/auth.js pickMain/mergeRow）

// 微信公众平台（服务号）AppId：真接入网页授权时填上（需与后端 WX_OAUTH_APPID 一致）；
// 留空时「微信登录」自动降级为匿名访客登录（guest 账号，后续可用手机号绑定找回）
export const WX_APPID = 'wx7ae8fa263da38a91'
// 是否微信内置浏览器（用于切换登录方式 / 触发网页授权）
export function isWechatEnv() {
  return typeof navigator !== 'undefined' && /micromessenger/i.test(navigator.userAgent)
}

// 组装微信网页授权跳转地址
// scope 说明：snsapi_base 静默授权（只拿 openid，免点击同意，无认证要求）；
//             snsapi_userinfo 需认证服务号 + 用户手动同意（拿昵称头像）。
// 2026-09-10 Capri 要求完整授权体验 → 切回 snsapi_userinfo（有同意页 + 昵称头像）。
// ⚠️ 硬策略（2026-09-10）：任何场景禁用静默授权（包括 PC 端 / 外部浏览器）。绝不调用 snsapi_base。
//    PC 端点微信登录会弹引导模态框让用户复制链接去微信内打开，禁止 mock 自动建账号。
export function buildWechatAuthUrl(redirect) {
  const appId = WX_APPID
  if (!appId) return ''
  const r = encodeURIComponent(redirect || location.href)
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appId}` +
    `&redirect_uri=${r}&response_type=code&scope=snsapi_userinfo&state=twd#wechat_redirect`
}

// 登录态落本地（与 ensureGuestAuth 读取的 key 一致）
function persistAuth(token, info) {
  try {
    localStorage.setItem('twd_token', token)
    localStorage.setItem('twd_userInfo', JSON.stringify(info))
  } catch (e) { /* ignore */ }
}

/**
 * 令牌是否「本地可判定为可用」：JWT 三段结构 + 未过期。
 * 前端拿不到签名密钥，验真伪是后端 verifyToken 的事；这里只挡掉明显失效的——
 * 换密钥/换部署后残留的旧 token、已过期 token。带上去只会污染请求。
 */
function isTokenUsable(t) {
  if (!t || String(t).startsWith('mock_')) return false
  if (String(t).split('.').length !== 3) return false
  const exp = jwtExp(t)
  return exp > 0 && exp > Date.now()
}

// 读取当前匿名/弱身份凭据（用于账号合并）
function currentIdentity() {
  let guestId = ''
  try { guestId = localStorage.getItem('twd_guest_id') || '' } catch (e) { /* ignore */ }
  const ui = localUser()
  const t = localToken() || ''
  // 仅当持有「本地判定可用」的 JWT 时才下发 bindUserId（后端仍会再验一次签名与 uid）：
  // 旧版只看 token 非 mock_，于是残留的失效 token + 旧 userInfo 会被判 403 卡死登录。
  const canBind = isTokenUsable(t)
  const bindUserId = (canBind && ui && ui.id && !ui.phone) ? String(ui.id) : ''
  return { guestId, bindUserId }
}

/** 清理本地登录态（token 已失效时调用，避免「看着已登录、实际全报错」） */
export function clearStaleAuth() {
  try {
    localStorage.removeItem('twd_token')
    localStorage.removeItem('twd_userInfo')
  } catch (e) { /* ignore */ }
}

// 是否「网络层失败」（此时允许回退 mock）；业务错误(验证码错/429/400)必须如实上抛
function isNetErr(e) {
  return e instanceof TypeError || /fetch|network|Failed to fetch|NetworkError/i.test(String((e && e.message) || ''))
}

// 后端 user 行 → 前端 userInfo 形状
function shapeUser(d, fallbackNick) {
  const u = (d && d.user) || {}
  return {
    id: String(u.id || ''),
    nickname: u.nickname || fallbackNick || '花友',
    avatar: u.avatar || '',
    phone: u.phone || '',
    openid: u.openid || '',
    username: u.username || '',
    hasPassword: !!u.hasPassword,
    guest: !!(u.guest || (!u.phone && !u.openid && !u.username))
  }
}

// 微信登录：真接入(code=授权回跳) → /auth/wechat 换 openid 统一账号。
// ⚠️ 硬策略（2026-09-10）：任何场景禁用静默授权（包括 PC 端 / 外部浏览器 / AppID 缺失 / 网络失败）。
//    - 无 code 进来 → 抛出错误（前端必须先经过 buildWechatAuthUrl 跳授权页回跳拿 code）
//    - 网络失败 → 抛出错误，禁止降级 ensureGuestAuth 创建匿名账号（避免「假微信登录成功」误导用户）
export async function loginByWechat(profile) {
  const code = profile && profile.code
  if (!REAL_API_ENABLED) {
    throw new Error('微信登录未配置（VITE_API_BASE 缺失）')
  }
  if (!code) {
    throw new Error('缺少授权 code（请通过微信网页授权 snsapi_userinfo 拿到 code 后回跳）')
  }
  const { guestId, bindUserId } = currentIdentity()
  const d = await realPost('/auth/wechat', {
    code,
    guestId: guestId || undefined,
    bindUserId: bindUserId || undefined
  }, localToken() || undefined)
  const info = shapeUser(d, '微信用户')
  persistAuth(d.token, info)
  return { userInfo: info, token: d.token }
}

// ===== PC 端微信扫码登录（微信开放平台「网站应用」，scope=snsapi_login） =====
// 流程：PC 点微信登录 → 拉 /auth/config 看 pcWechatReady → 跳 qrconnect 二维码页 →
//      手机微信扫码确认 → 回跳带 code(state=twdpc) → loginByWechatPc → 后端 unionid 跨端归一。
// 未配置（网站应用还在审核）→ 前端保持「请在微信中打开」引导，绝不静默建账号。

// /auth/config 带缓存（配置只在后端重启后变化，会话内缓存足够）
let authConfigCache = null
export async function fetchAuthConfig(force) {
  if (!REAL_API_ENABLED) return null
  if (authConfigCache && !force) return authConfigCache
  try {
    authConfigCache = await realApi('/auth/config')
    return authConfigCache
  } catch (e) {
    console.warn('[api] /auth/config 拉取失败：', e && e.message)
    return null
  }
}

// PC 端扫码授权地址（qrconnect 与手机端 authorize 不同端点；appId = 开放平台网站应用 AppID）
export function buildWechatPcAuthUrl(redirect, appId) {
  if (!appId) return ''
  const r = encodeURIComponent(redirect || location.href)
  return `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}` +
    `&redirect_uri=${r}&response_type=code&scope=snsapi_login&state=twdpc#wechat_redirect`
}

// PC 扫码回跳 code 登录（后端 /auth/wechat-pc 换 token/unionid，与手机端同一账号体系）
// 同硬策略：无 code / 网络失败 → 抛错，禁止任何降级。
export async function loginByWechatPc(profile) {
  const code = profile && profile.code
  if (!REAL_API_ENABLED) {
    throw new Error('微信登录未配置（VITE_API_BASE 缺失）')
  }
  if (!code) {
    throw new Error('缺少授权 code（请通过微信扫码登录 snsapi_login 拿到 code 后回跳）')
  }
  const { guestId, bindUserId } = currentIdentity()
  const d = await realPost('/auth/wechat-pc', {
    code,
    guestId: guestId || undefined,
    bindUserId: bindUserId || undefined
  }, localToken() || undefined)
  const info = shapeUser(d, '微信用户')
  persistAuth(d.token, info)
  return { userInfo: info, token: d.token }
}

// ===== PC 端微信登录·方案 B：H5 扫码中转（无需微信开放平台审核，即刻可用） =====
// 流程：PC 前端生成随机 ticket → 二维码内容 = https://h5.tiaowulan.com/login?pc=<ticket> →
//      手机微信扫码打开 H5 → 走公众号网页授权 snsapi_userinfo 登录（有同意框，符合硬策略）→
//      手机端调 pcApprove(ticket) 把票据绑到当前账号 →
//      PC 端轮询 pcStatus(ticket) → approved 时拿到同账号 token 登录完成。
// 票据 TTL 5 分钟、一次性消费；与手机微信登录是同一 uid（订单/地址互通）。

// 生成 PC 扫码票据（crypto 随机 32 位 hex；后端正则 ^[a-f0-9]{16,64}$ 校验）
export function genPcTicket() {
  const c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null
  const buf = new Uint8Array(16)
  if (c) c.getRandomValues(buf)
  else for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

// 手机端：登录后调用（带本地 token），把 PC 票据绑定到当前账号
export async function pcApprove(ticket) {
  if (!REAL_API_ENABLED) throw new Error('微信登录未配置（VITE_API_BASE 缺失）')
  if (!ticket) throw new Error('缺少 PC 票据')
  return realPost('/auth/pc-approve', { ticket }, localToken() || undefined)
}

// PC 端：轮询票据状态；approved 时返回 { status:'approved', token, user }
export async function pcStatus(ticket) {
  if (!REAL_API_ENABLED) throw new Error('微信登录未配置（VITE_API_BASE 缺失）')
  if (!ticket) throw new Error('缺少 PC 票据')
  return realApi('/auth/pc-status', { ticket })
}

// 发送短信验证码：真后端 debug 模式回显测试码（供 UI 提示）；tencent 模式真发
export async function sendSmsCode(phone) {
  if (REAL_API_ENABLED) {
    try {
      const d = await realPost('/auth/sms/send', { phone })
      return { ok: true, debug: !!d.debug, code: d.code || '' }
    } catch (e) {
      if (!isNetErr(e)) throw e // 429 限频/手机号格式等如实上报
      if (!ALLOW_MOCK_FALLBACK) throw e // /auth/sms/send：生产不回退演示数据
      console.warn('[api] /auth/sms/send 网络失败，回退 mock：', e && e.message)
    }
  }
  await delay(300)
  return { ok: true, debug: true, code: '123456' } // mock：万能码
}

// 手机号 + 验证码登录：真后端校验 + 账号统一（guest/当前账号并入手机号主账号）
// ⚠️ 硬策略：登录必须真实，网络失败直接抛错，绝不回退 mock 制造「假登录成功」
export async function loginByPhone(phone, code) {
  if (!REAL_API_ENABLED) throw new Error('登录服务未配置（VITE_API_BASE 缺失）')
  const { guestId, bindUserId } = currentIdentity()
  const d = await realPost('/auth/sms/login', {
    phone,
    code,
    guestId: guestId || undefined,
    bindUserId: bindUserId || undefined,
    nickname: '花友' + phone.slice(-4)
  }, localToken() || undefined)
  const info = shapeUser(d, '花友' + phone.slice(-4))
  persistAuth(d.token, info)
  return { userInfo: info, token: d.token }
}

// 账号密码注册：账号 + 密码 + 手机号（短信验证码）→ 后端 /auth/register 创建并直接登录
// ⚠️ 硬策略：注册必须真实落库，失败直接抛错，绝不回退 mock 制造「假注册成功」
export async function registerAccount({ username, password, phone, code, nickname }) {
  if (!REAL_API_ENABLED) throw new Error('注册服务未配置（VITE_API_BASE 缺失）')
  const { guestId, bindUserId } = currentIdentity()
  const d = await realPost('/auth/register', {
    username,
    password,
    phone,
    code,
    nickname: nickname || ('花友' + String(phone).slice(-4)),
    guestId: guestId || undefined,
    bindUserId: bindUserId || undefined
  }, localToken() || undefined)
  const info = shapeUser(d, username)
  persistAuth(d.token, info)
  return { userInfo: info, token: d.token }
}

// 账号密码登录：account 支持「账号」或「手机号」
// ⚠️ 硬策略：必须真实验证，失败直接抛错，绝不回退 mock
export async function loginByPassword(account, password) {
  if (!REAL_API_ENABLED) throw new Error('登录服务未配置（VITE_API_BASE 缺失）')
  const d = await realPost('/auth/password/login', { account, password })
  const info = shapeUser(d, account)
  persistAuth(d.token, info)
  return { userInfo: info, token: d.token }
}

// ===== AI 花艺顾问（对接跳舞兰自研智能体平台）=====
// 平台：https://api.tiaowulan.com （OpenAPI: /openapi.json，标题「跳舞兰花卉智能体 API」）
// 鉴权：X-API-Key（平台 Key）换 Bearer token
//   1) POST /auth/token  body {external_user_id}  header X-API-Key  -> {access_token, user_id}
//   2) POST /chat        body {message, user_id, session_id?, shop_id?}  header Authorization: Bearer <token>
//      响应为结构化 UI：{ reply, ui, action:{type,payload}, tool_calls:[...], data:{poll} }
//      ui 类型：text / dialog_options / plan_card / shop_card / order_card / pay_jump
// 开发态：apiBase 默认 '/agent'（Vite dev 代理转发，同源免 CORS）；生产可设 VITE_AGENT_API_BASE=https://api.tiaowulan.com
// 任何异常（无 key / 网络 / CORS / 超时）→ 自动回退前端 mock 演示
// 🔴 平台 Key 绝不进前端包 —— 且**不能**从 `import.meta.env.VITE_*` 取：
//    Vite 会在构建期把 VITE_ 前缀变量**内联成字面量**写进 bundle，
//    打包后浏览器一看 JS 就能拿到，等于把密钥公开挂在网上
//    （2026-09-18 外部审计 P0-2：线上 api-*.js 里确实躺着明文 Key，已移除）。
//    生产一律走同源反代（apiBase='/agent'），由 deploy/server.cjs 在服务端注入 X-API-Key。
export const AGENT_CONFIG = {
  apiBase: import.meta.env.VITE_AGENT_API_BASE || '/agent',
  enabled: true, // 就绪即走真实智能体，失败自动回退 mock
  get apiToken() {
    // 刻意恒为空：前端不需要、也永远拿不到平台 Key。
    return ''
  },
  // apiBase 为相对路径 = 经同源反代，key 由服务端注入
  get viaProxy() {
    return this.apiBase.indexOf('://') === -1
  },
  get ready() {
    return this.enabled && (!!this.apiToken || this.viaProxy)
  }
}

// 有 key 时才带 X-API-Key；经反代时前端不发该头（由服务端补齐）
function agentKeyHeader() {
  return AGENT_CONFIG.apiToken ? { 'X-API-Key': AGENT_CONFIG.apiToken } : {}
}

// 场景预设（与小程序 ai-chat 一致）
const SCENE_PRESETS = {
  birthday: {
    label: '生日祝福',
    prompt: '送朋友生日，预算200元左右，希望温暖明亮一点',
    scene: '生日',
    emotion: '祝福、开心、被重视',
    style: '明亮温暖',
    palette: ['#f8c96b', '#f49a73', '#fff1c7'],
    materials: ['向日葵', '香槟玫瑰', '洋桔梗', '尤加利'],
    card: '生日快乐，愿你一路有光，所遇皆暖，所有期待都如愿。'
  },
  apology: {
    label: '道歉和好',
    prompt: '我想向女朋友道歉，希望真诚一点，不要太夸张',
    scene: '道歉',
    emotion: '歉意、珍惜、希望和好',
    style: '柔和克制',
    palette: ['#f6c7cf', '#ffffff', '#b9d8c4'],
    materials: ['粉玫瑰', '白桔梗', '白玫瑰', '尤加利'],
    card: '对不起，这次是我不好。愿这束花先替我表达真心和在乎。'
  },
  confess: {
    label: '表白心意',
    prompt: '想表白，关系还没确定，希望浪漫但不要有压力',
    scene: '表白',
    emotion: '心动、克制、温柔表达',
    style: '轻浪漫',
    palette: ['#f4a6b7', '#ffe7ec', '#d8c3f4'],
    materials: ['粉玫瑰', '紫罗兰', '洋甘菊', '满天星'],
    card: '喜欢你这件事，我想让鲜花先替我说出口。'
  },
  thanks: {
    label: '感谢帮助',
    prompt: '想感谢一个一直帮助我的人，希望大方真诚',
    scene: '感谢',
    emotion: '感谢、珍惜、温暖',
    style: '自然大方',
    palette: ['#f1d7a7', '#f8f4e8', '#9dbb98'],
    materials: ['香槟玫瑰', '洋桔梗', '小菊', '尤加利'],
    card: '谢谢你的照顾与支持，愿这束花把我的真心送到你身边。'
  }
}

// 从智能体响应里兼容多种字段名提取商品数组
// ===== 个人资料（昵称 / 性别 / 头像）=====
// ⚠️ 过去「保存修改」只写 localStorage，**服务器完全不知道**（换设备/清缓存即丢）。
//    这两个接口把它真正落库。
/** 上传头像：dataUrl 由前端 canvas 压缩后生成（512×512 JPEG），后端零依赖解码存盘 */
export async function uploadAvatar(dataUrl) {
  const a = await ensureGuestAuth()
  if (a.offline) throw new Error('网络不可用，头像未上传')
  const r = await realPost('/auth/avatar', { dataUrl }, a.token)
  if (!r || !r.url) throw new Error('头像上传失败')
  return r
}

/** 更新个人资料（昵称/性别/头像）→ { ok, user }；离线时返回 offline 标志，由调用方兜底 */
export async function updateProfile(patch) {
  const a = await ensureGuestAuth()
  if (a.offline) return { ok: false, offline: true, user: null }
  return await realPost('/auth/profile', patch || {}, a.token)
}

export function extractAgentProducts(payload) {
  const sources = [
    payload && payload.products,
    payload && payload.recommendations,
    payload && payload.items,
    payload && payload.data && payload.data.products,
    payload && payload.result && payload.result.products,
    payload && payload.result && payload.result.recommendations
  ]
  return sources.find(list => Array.isArray(list)) || []
}

// 归一化商品（价格兼容 元/分 多种字段）
export function normalizeAgentProducts(products, shopId = 'default') {
  return products
    .map(item => {
      const p = item && typeof item === 'object' ? item : {}
      const id = String(p.id || p.product_id || p.productId || p.plan_id || p.planId || '').trim()
      const name = String(p.name || p.title || p.product_name || '推荐花束').trim()
      const rawPrice =
        p.price_yuan !== undefined ? p.price_yuan
          : p.price_cent !== undefined ? Number(p.price_cent) / 100
            : p.price_fen !== undefined ? Number(p.price_fen) / 100
              : p.price
      const price = Number(rawPrice)
      const image = p.image || p.image_url || p.imageUrl || (Array.isArray(p.images) ? p.images[0] : '') || ''
      return {
        ...p,
        id,
        name,
        price: Number.isFinite(price) ? price : 0,
        priceText: Number.isFinite(price) ? price.toFixed(2) : '到店咨询',
        image,
        shopId: p.shop_id || p.shopId || shopId
      }
    })
    .filter(p => p.id && p.name)
}

function matchPreset(text) {
  if (/道歉|和好|原谅|生气|吵架|对不起|抱歉/.test(text)) return SCENE_PRESETS.apology
  if (/表白|喜欢|暗恋|心动|告白|追你/.test(text)) return SCENE_PRESETS.confess
  if (/感谢|谢谢|帮助|照顾|辛苦/.test(text)) return SCENE_PRESETS.thanks
  if (/生日|寿星|周岁|冥诞/.test(text)) return SCENE_PRESETS.birthday
  return null
}

function matchBudget(text) {
  const m = String(text).match(/(\d{2,4})\s*元?/)
  return m ? Number(m[1]) : 0
}

// 未命中任何场景时的中性兜底方案（不再默认生日，避免误导）
const GENERIC_PLAN = {
  title: '专属花艺方案',
  scene: '定制',
  emotion: '用心挑选，把心意送到 TA 手里',
  style: '随你心意',
  budgetText: '约 ¥199-299',
  materials: ['玫瑰', '洋桔梗', '尤加利', '满天星'],
  palette: ['#f8c96b', '#f49a73', '#fff1c7'],
  card: '一束为你而选的花，把想说的话轻轻递到 TA 手里。',
  sourceText: ''
}

function buildPlanFromText(text) {
  const source = matchPreset(text) || GENERIC_PLAN
  const budget = matchBudget(text)
  return {
    // ⚠️ SCENE_PRESETS 里只有 label、没有 title（GENERIC_PLAN 才有 title），
    //    原来直接读 source.title → 预设场景一律渲染成「undefined」。
    title: source.title || source.label || GENERIC_PLAN.title,
    scene: source.scene,
    emotion: source.emotion,
    style: source.style,
    budgetText: budget ? `约 ¥${budget}` : (source.budgetText || GENERIC_PLAN.budgetText),
    materials: source.materials,

    palette: source.palette,
    card: source.card,
    sourceText: text
  }
}

// 前端 mock：从 mock 花束里按场景挑 3 个推荐
function buildMockProducts(plan, shopId) {
  const pool = mockData.flowers
  let picked = pool
    .filter(f => (f.tags || []).some(t => plan.emotion.includes(t) || plan.scene.includes(t)))
    .slice(0, 3)
  if (picked.length < 3) picked = pool.slice(0, 3)
  return picked.map(f => ({
    id: f.id,
    name: f.name,
    price: Math.round((f.price || 0) / 100),
    priceText: ((f.price || 0) / 100).toFixed(2),
    image: f.image || '',
    shopId
  }))
}

function buildMockAdvisorReply(text, shopId) {
  const plan = buildPlanFromText(text)
  const products = buildMockProducts(plan, shopId)
  const reply =
    `已为你生成「${plan.title}」💐\n` +
    `想表达的：${plan.emotion}\n` +
    `风格方向：${plan.style}\n` +
    `预算参考：${plan.budgetText}\n` +
    `推荐花材：${plan.materials.join('、')}\n` +
    `贺卡建议：${plan.card}\n` +
    `下面是为你挑选的参考花束，喜欢可以直接加入购物车～`
  return { reply, products, sessionId: '', mock: true }
}

/**
 * 智能体平台用的「外部用户标识」——决定平台侧会话与记忆归属。
 *
 * ⚠️ 必须绑定**账号**而不是设备：平台按 user_id 存会话，若每台设备各用一个随机 ID，
 *    手机和电脑会被当成两个人，对话永远不同步（旧实现正是本机随机 h5_anon_xxx 且从不覆盖）。
 *
 * 规则：已登录 → `h5_u_<账号id>`（手机/电脑同一账号 → 一致）；未登录 → 本机匿名 ID。
 */
function getExternalUid() {
  try {
    const t = localToken()
    const ui = localUser()
    if (isTokenUsable(t) && ui && ui.id) return 'h5_u_' + ui.id
  } catch (e) { /* 读不到就退回匿名 */ }
  try {
    let anon = localStorage.getItem('twd_external_uid')
    if (!anon) {
      anon = 'h5_anon_' + Math.random().toString(36).slice(2, 10)
      localStorage.setItem('twd_external_uid', anon)
    }
    return anon
  } catch (e) {
    return 'h5_anon_' + Math.random().toString(36).slice(2, 10)
  }
}

// 解析 JWT 过期时间（毫秒）
function jwtExp(token) {
  try {
    const p = String(token).split('.')[1]
    const json = decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/'))))
    const d = JSON.parse(json)
    return (d.exp || 0) * 1000
  } catch (e) {
    return 0
  }
}

let agentToken = ''
let agentTokenExp = 0
let agentUserId = ''
let agentTokenUid = '' // 该 token 对应哪个 external_user_id（身份变了必须重新签发）

// 1) 用平台 Key 换 Bearer token（带内存+过期缓存）
/**
 * 限流 / 服务繁忙识别。
 * 🔴 这类失败**绝不能**回退到 mock 演示数据 —— 那会让页面显示假回复并切到「演示模式」，
 *    用户看起来就像"功能坏了"。必须如实提示「稍后再试」，模式保持原样。
 */
export function isAgentRateLimited(e) {
  return !!e && (e.rateLimited === true || Number(e.status) === 429)
}
export async function agentHttpError(res, tag) {
  let detail = ''
  try { detail = String(((await res.json()) || {}).detail || '') } catch (e) { /* 非 JSON 响应 */ }
  const err = new Error(tag + ' ' + res.status + (detail ? '：' + detail : ''))
  err.status = res.status
  if (res.status === 429) err.rateLimited = true
  return err
}

async function ensureAgentToken() {
  const ext = getExternalUid()
  // 身份变化（例如刚从匿名转为登录）→ 旧 token 属于另一个用户，必须重签，
  // 否则登录后仍以匿名身份对话，history 挂不到账号上。
  if (agentToken && agentTokenUid === ext && Date.now() < agentTokenExp - 60000) return agentToken
  const res = await fetch(AGENT_CONFIG.apiBase + '/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...agentKeyHeader() },
    body: JSON.stringify({ external_user_id: ext })
  })
  if (!res.ok) throw await agentHttpError(res, 'agent token')
  const d = await res.json()
  agentToken = d.access_token
  agentUserId = d.user_id || ''
  agentTokenUid = ext
  agentTokenExp = jwtExp(agentToken) || Date.now() + 29 * 24 * 3600 * 1000
  return agentToken
}

// ===== 会话历史（跨设备同步用；智能体平台按 user_id 存会话）=====

async function greetingRequest(endpoint, payload, signal) {
  const token = await ensureAgentToken()
  if (!agentUserId) throw new Error('未取得贺卡用户身份')
  const response = await fetch(AGENT_CONFIG.apiBase + '/greetings/' + endpoint, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...payload, user_id: agentUserId })
  })
  if (!response.ok) throw await agentHttpError(response, 'greeting')
  return response.json()
}

export const draftGreeting = (payload, signal) => greetingRequest('draft', payload, signal)
export const renderGreeting = (payload, signal) => greetingRequest('render', payload, signal)

/** 当前账号在智能体平台的会话列表（新→旧） */
export async function listAgentConversations() {
  if (!AGENT_CONFIG.ready) return []
  const tok = await ensureAgentToken()
  if (!agentUserId) return []
  const res = await fetch(AGENT_CONFIG.apiBase + '/conversations?user_id=' + encodeURIComponent(agentUserId), {
    headers: { Accept: 'application/json', Authorization: `Bearer ${tok}`, ...agentKeyHeader() }
  })
  if (!res.ok) throw new Error('agent conversations ' + res.status)
  const d = await res.json()
  return Array.isArray(d) ? d : ((d && d.items) || [])
}

/** 某会话的历史消息 → 前端消息形状（平台只存 role/content/ui） */
export async function fetchAgentMessages(conversationId, limit = 100) {
  if (!AGENT_CONFIG.ready || !conversationId) return []
  const tok = await ensureAgentToken()
  const url = AGENT_CONFIG.apiBase + '/conversations/' + encodeURIComponent(conversationId) +
    '/messages?user_id=' + encodeURIComponent(agentUserId) + '&limit=' + limit
  const res = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${tok}`, ...agentKeyHeader() }
  })
  if (!res.ok) throw new Error('agent messages ' + res.status)
  const d = await res.json()
  const arr = Array.isArray(d) ? d : ((d && d.items) || [])
  return arr
    .map(m => ({
      role: m && m.role === 'user' ? 'user' : 'ai',
      text: String((m && m.content) || ''),
      cards: [],
      tools: []
    }))
    .filter(m => m.text)
}

// 从方案对象里解析价格（兼容 元/分 多字段）
function parseAgentPrice(obj) {
  if (!obj || typeof obj !== 'object') return 0
  const cands = [obj.total_estimate, obj.price, obj.budget_num, obj.estimated_price, obj.price_yuan]
  for (const c of cands) {
    if (typeof c === 'number' && c > 0) return c
    if (typeof c === 'string') {
      const m = c.match(/(\d+(?:\.\d+)?)/)
      if (m) return Number(m[1])
    }
  }
  return 0
}

// 把原始结构化响应归一化为前端可渲染的消息
function normalizeAdvisorResponse(r, sessionId) {
  if (!r || typeof r !== 'object') {
    return { reply: '', ui: 'text', options: [], plans: [], shops: [], poll: null, sessionId }
  }
  const ui = r.ui || (r.action && r.action.type) || 'text'
  const payload = (r.action && r.action.payload) || r
  const options = payload.options || r.options || []
  let plans = payload.plans || r.plans || []
  const shops = payload.shops || r.shops || []
  const poll = r.data && r.data.poll
    ? (String(r.data.poll).startsWith('http') ? r.data.poll : AGENT_CONFIG.apiBase + r.data.poll)
    : null

  // 没 plan_card 时，从 tool_calls 的 DIY 方案结果里提取
  if (!plans.length && Array.isArray(r.tool_calls)) {
    for (const tc of r.tool_calls) {
      if (!tc || !tc.name) continue
      if (!/plan|diy|flower/.test(tc.name.toLowerCase())) continue
      const obj = typeof tc.result === 'string'
        ? (() => { try { return JSON.parse(tc.result) } catch (e) { return null } })()
        : tc.result
      if (!obj) continue
      plans.push({
        plan_id: obj.plan_id || tc.name,
        name: obj.name || '为你定制的花艺方案',
        price: parseAgentPrice(obj),
        desc: obj.desc || obj.meaning || (obj.design && obj.design.packaging) || '',
        image: obj.effect_image_url || obj.image_url || obj.image || '',
        merchant: obj.merchant_name || '',
        raw: obj
      })
    }
  }

  return {
    reply: r.reply || payload.reply || '',
    ui,
    options: Array.isArray(options) ? options.map(o => ({ label: o.label, value: o.value })) : [],
    plans: plans.map(p => ({
      id: String(p.plan_id || p.name),
      name: p.name,
      price: p.price,
      priceText: p.price ? p.price.toFixed(2) : '到店咨询',
      desc: p.desc || '',
      image: p.image || '',
      shopId: p.shopId || 'default'
    })),
    shops: Array.isArray(shops) ? shops : [],
    poll: poll || null,
    mock: false,
    sessionId: r.session_id || sessionId || ''
  }
}

/**
 * 入口上下文 → 请求字段。
 *
 * 智能体靠这三个字段判断「用户从哪儿来」：从商品详情页进来就锁定那家店，
 * 推荐结果自然与收货城市一致（可直接下单）；不传则走全平台模式，可能推荐到
 * 别的城市的商品，被 H5 的城市过滤剔除后卡片就空了。
 *
 * 只下发有值的字段：空字符串会覆盖平台侧的会话记忆（比如同一个 session 里
 * 第二轮没带 product_id，不该把第一轮的锁定清掉）。
 */
function agentEntryFields({ entry, productId, productTitle } = {}) {
  const f = {}
  if (entry) f.entry = entry
  if (productId) {
    f.product_id = productId
    if (productTitle) f.product_title = productTitle
  }
  return f
}

// 主入口：优先真实智能体，失败回退 mock
export async function chatWithAdvisor({ message, shopId = 'default', sessionId = '', entry, productId, productTitle } = {}) {
  if (AGENT_CONFIG.ready) {
    try {
      const tok = await ensureAgentToken()
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 60000)
      const res = await fetch(AGENT_CONFIG.apiBase + '/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok}`,
          ...agentKeyHeader()
        },
        body: JSON.stringify({
          message,
          user_id: agentUserId || getExternalUid(),
          session_id: sessionId,
          shop_id: shopId,
          ...agentEntryFields({ entry, productId, productTitle })
        }),
        signal: ctrl.signal
      })
      clearTimeout(timer)
      if (!res.ok) throw await agentHttpError(res, 'chat')
      const r = await res.json()
      const norm = normalizeAdvisorResponse(r, sessionId)
      norm.sessionId = norm.sessionId || sessionId
      return norm
    } catch (e) {
      // 限流 / 服务繁忙：**不回退**（回退会显示假回复 + 切成「演示模式」，用户以为坏了）
      if (isAgentRateLimited(e)) {
        console.warn('[advisor] 被限流/服务繁忙：', e && e.message)
        const err = new Error(e.message || '当前咨询较多，请稍后再试')
        err.rateLimited = true
        throw err
      }
      // 跨域 / 网络 / 超时 / 401：回退 mock
      console.warn('[advisor] 真实智能体不可用，回退 mock：', e && e.message)
    }
  }
  // mock 演示
  await delay(600 + Math.random() * 500)
  return buildMockAdvisorReply(message, shopId)
}

// 解析一段 SSE（形如 "event: text\ndata: {...}"）
function parseSseChunk(chunk) {
  const lines = String(chunk).split(/\r?\n/)
  let event = 'message'
  const dataLines = []
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (!dataLines.length) return null
  const raw = dataLines.join('\n')
  let data = raw
  try { data = JSON.parse(raw) } catch (e) { /* 非 JSON 时保留原文 */ }
  return { event, data }
}

// 流式对话（SSE POST /chat/stream）
// 事件类型（实测）：
//   tool_call → { name, status }               智能体正在调用工具（查库等）
//   text      → { content }                    文本增量，可多次
//   card      → { ui, data }                   结构化卡片（plan_card/order_card/shop_card/pay_jump/image_task/greeting_card/dialog_options）
//   done      → { session_id }                 结束，携带会话 id
// onEvent(ev) 逐事件回调；返回 { ok, gotAny, sessionId }
export async function streamAdvisorChat({ message, shopId = 'default', sessionId = '', entry, productId, productTitle, onEvent, signal } = {}) {
  if (!AGENT_CONFIG.ready) return { ok: false, gotAny: false, sessionId }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120000)
  const onAbort = () => ctrl.abort()
  if (signal) signal.addEventListener('abort', onAbort)
  let gotAny = false
  let finalSessionId = sessionId
  try {
    const tok = await ensureAgentToken()
    const res = await fetch(AGENT_CONFIG.apiBase + '/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${tok}`,
        ...agentKeyHeader()
      },
      body: JSON.stringify({
        message,
        user_id: agentUserId || getExternalUid(),
        session_id: sessionId || null,
        shop_id: shopId,
        ...agentEntryFields({ entry, productId, productTitle })
      }),
      signal: ctrl.signal
    })
    if (!res.ok) throw await agentHttpError(res, 'stream')
    if (!res.body) throw new Error('stream: no body')
    const reader = res.body.getReader()
    const dec = new TextDecoder('utf-8')
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const ev = parseSseChunk(chunk)
        if (!ev) continue
        gotAny = true
        if (ev.event === 'done' && ev.data && ev.data.session_id) finalSessionId = ev.data.session_id
        if (typeof onEvent === 'function') onEvent(ev)
      }
    }
    return { ok: true, gotAny, sessionId: finalSessionId }
  } catch (e) {
    // 限流 / 服务繁忙：**不回退**，如实上报让调用方提示（回退会变成"演示模式"+假回复）
    if (isAgentRateLimited(e)) {
      console.warn('[advisor] 被限流/服务繁忙：', e && e.message)
      return { ok: false, rateLimited: true, message: e && e.message, gotAny, sessionId: finalSessionId }
    }
    console.warn('[advisor] 流式对话失败，回退普通对话：', e && e.message)
    return { ok: false, gotAny, sessionId: finalSessionId }
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

/**
 * 平台返回的资源地址可能是**相对路径**（实测效果图是 `/generated/xxx.png`）。
 * 直接塞进 <img src> 会打到前端自己的域名上 → 图裂。统一补上 apiBase（/agent）走反代。
 */
// 实现已抽到 src/utils/agentAsset.js（纯函数、可单测）；这里只绑定当前 apiBase。
// 🔴 该函数**必须幂等**：调用方常会重复归一化，不幂等会拼出 /agent/agent/... → 404。
export function normalizeAgentAssetUrl(u) {
  return normalizeAgentAssetUrlPure(u, AGENT_CONFIG.apiBase || '')
}

/**
 * 轮询效果图任务。平台 /ui-contract 的 image_task 契约：
 *   data = { task_id, poll: '/tasks/xxx', result_url }
 *   status：processing 生成中 / done 成功（取 result_url）/ failed 失败（读 error）
 * @param {string} pollUrl 平台给的 poll 路径（**相对路径**，如 /tasks/xxx）或完整 URL
 * @param {Function|{onImage?:Function,onStatus?:Function}} cb
 */
export async function pollAgentTask(pollUrl, cb = {}) {
  const onImage = typeof cb === 'function' ? cb : cb.onImage // 兼容旧的单回调签名
  const onStatus = typeof cb === 'function' ? null : cb.onStatus
  if (!pollUrl) return null
  // ⚠️ 平台给的是相对路径（/tasks/xxx），必须经 apiBase（/agent）转发以便注入 X-API-Key；
  //    直接 fetch 会打到前端自己的域名上 → 永远 404，效果图也就永远出不来。
  const url = String(pollUrl).startsWith('http') ? String(pollUrl) : (AGENT_CONFIG.apiBase + pollUrl)
  // ⚠️ /tasks/{id} 需要 **Bearer 登录凭证**（实测只带 X-API-Key 会 401「需要 Bearer 登录凭证」）
  let token = ''
  try { token = await ensureAgentToken() } catch (e) { return null }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 150000)
  try {
    // 生图通常十几秒，慢时会更久 —— 对齐官方 demo（45 次 × 3.5s），避免"等不到图就放弃"
    for (let i = 0; i < 40; i++) {
      let d = null
      try {
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...agentKeyHeader()
          },
          signal: ctrl.signal
        })
        if (!res.ok) break
        d = await res.json()
      } catch (e) { break }
      if (!d || typeof d !== 'object') break

      const status = String(d.status || d.stage || '').toLowerCase()
      // 契约字段是 result_url；后面几个是兼容其它写法。
      // ⚠️ 实测 result_url 是**相对路径**（/generated/xxx.png），必须归一化后才能给 <img>
      const raw = d.result_url || d.image_url || d.effect_image_url || d.url ||
        (d.result && d.result.image_url) || ''
      const img = normalizeAgentAssetUrl(raw)
      if (img && onImage) onImage(img)

      if (status === 'failed' || status === 'error') {
        if (onStatus) onStatus('failed', d.error || d.message || '')
        break
      }
      if (status === 'done' || status === 'completed' || status === 'succeeded') {
        if (onStatus) onStatus('done', '')
        break
      }
      if (onStatus) onStatus(status || 'processing', '')
      await new Promise(r => setTimeout(r, 3500))
    }
  } catch (e) {
    /* 轮询失败静默：图片出不来不应影响对话本身 */
  } finally {
    clearTimeout(timer)
  }
  return null
}

export const ADVISOR_PRESETS = Object.keys(SCENE_PRESETS).map(key => ({ key, ...SCENE_PRESETS[key] }))
