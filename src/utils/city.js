/**
 * 城市维度工具（浏览城市 = 你能买到哪些城市的商品）
 *
 * 背景：商家后端 `orders/create` 会硬校验「收货城市 == 门店服务城市」，
 * 不匹配直接拒单（文案「该商品由 XX 门店配送…请返回首页切换至 YY 市」）。
 * 所以 H5 必须与小程序一致：**先选城市 → 再按城市筛门店与商品**，
 * 否则用户会买到别城的花、付款成功后被拒单 —— 比不接通更糟。
 *
 * 用法：任何按城市取数的页面，先 `await ensureCity()`，再用 `store.city` 请求。
 */
import store, { setCity, markCityReady } from '@/store'
import { getCities, getShopList } from '@/mock/api'

/** 已开通城市列表（进程内缓存；getCities 自身另有 5 分钟 TTL） */
let listCache = []
let inflight = null

/** 城市名宽松比较：「福州」≈「福州市」（与商家 API 的匹配方式一致） */
export function sameCity(a, b) {
  const norm = s => String(s || '').trim().replace(/市$/, '')
  const x = norm(a)
  return !!x && x === norm(b)
}

/** 取已开通城市列表：[{ name:'福州', shops:2 }]，按门店数降序 */
export async function cityList() {
  if (listCache.length) return listCache
  try {
    const rows = await getCities()
    listCache = (Array.isArray(rows) ? rows : []).filter(r => r && r.name)
  } catch (e) {
    console.warn('[city] 城市列表获取失败：', e && e.message)
    listCache = []
  }
  return listCache
}

/** 该城市是否已开通（无列表时一律返回 true，避免误拦） */
export function isOpenedCity(name) {
  if (!listCache.length) return true
  return listCache.some(c => sameCity(c.name, name))
}

/** 按宽松匹配取出列表里的规范城市名（如传「福州市」返回「福州」） */
export function canonicalCity(name) {
  const hit = listCache.find(c => sameCity(c.name, name))
  return hit ? hit.name : String(name || '').trim()
}

/**
 * 确保「当前城市」已确定；各页面取数前 await 它。
 * 优先级：① 已保存且仍开通的城市 → ② 收货地址所在城市（若已开通）→ ③ 门店最多的城市
 */
export async function ensureCity() {
  if (store.cityReady) return store.city
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const list = await cityList()
      const names = list.map(c => c.name)
      if (!names.length) return store.city // 列表拿不到 → 保持现状，由结算校验兜底
      if (store.city && names.some(n => sameCity(n, store.city))) {
        setCity(canonicalCity(store.city))
        return store.city
      }
      const addrCity = (store.selectedAddress && store.selectedAddress.city) || ''
      if (addrCity && names.some(n => sameCity(n, addrCity))) {
        setCity(canonicalCity(addrCity))
        return store.city
      }
      setCity(names[0])
      return store.city
    } finally {
      markCityReady()
      inflight = null
    }
  })()
  return inflight
}

/** 切换城市（做规范化后落库；调用方负责重新取数） */
export function switchCity(name) {
  setCity(canonicalCity(name))
  return store.city
}

/** 清空进程内城市列表缓存（一般不需要；测试/手动刷新用） */
export function resetCityCache() {
  listCache = []
}

/** 当前城市的门店 id 集合（复用 getShopList 的 TTL 缓存） */
export async function cityShopIds(city) {
  const list = await getShopList(city || store.city)
  return new Set((list || []).map(s => String((s && s.id) || '')).filter(Boolean))
}

/**
 * 判断某个商品是否属于当前城市。
 * shopId 缺失或为占位值（'default'）时**无法判定 → 保留**（由结算校验兜底，宁可不误杀）。
 */
function keepByCity(shopId, ids) {
  const sid = String(shopId || '').trim()
  if (!sid || sid === 'default') return true
  return ids.has(sid)
}

/**
 * 按城市过滤「智能体返回的商品卡」。
 * 智能体的商品来自平台全量商品库（跨 11 个城市），而商家只做同城配送 ——
 * 不筛选就会出现「AI 推荐了福州的花、深圳用户买了、付款后被商家拒单」。
 *
 * 覆盖两条渲染路径：
 *   ① msg.products —— 非流式 `chatWithAdvisor` / mock 路径
 *   ② msg.cards[].data.plans —— 流式 SSE 的 plan_card（现成商品，diy !== true）
 * DIY 方案卡不涉及配送城市，保持不动。
 *
 * @returns {number} 被隐藏的条目数（0 = 无需提示）
 */
export async function filterAgentMessageByCity(msg) {
  if (!msg) return 0
  const city = store.city || (await ensureCity())
  if (!city) return 0
  const ids = await cityShopIds(city)
  if (!ids.size) return 0 // 门店列表拿不到 → 不做判断

  let dropped = 0

  if (Array.isArray(msg.products) && msg.products.length) {
    const kept = msg.products.filter(p => keepByCity(p && (p.shopId || p.shop_id), ids))
    dropped += msg.products.length - kept.length
    msg.products = kept
  }

  if (Array.isArray(msg.cards)) {
    msg.cards = msg.cards.filter(c => {
      if (!c || c.ui !== 'plan_card') return true
      const plans = c.data && c.data.plans
      if (!Array.isArray(plans) || !plans.length) return true
      const kept = plans.filter(p => {
        if (!p || p.diy === true) return true // DIY 方案不按城市过滤
        return keepByCity(p.shop_id || p.shopId, ids)
      })
      dropped += plans.length - kept.length
      if (!kept.length) return false // 整卡商品都不在本城 → 整卡不显示
      c.data.plans = kept
      return true
    })
  }

  return dropped
}
