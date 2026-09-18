// ============================================================================
// 商家后端订单桥接（H5 → flower-shop）
// ----------------------------------------------------------------------------
// 背景：H5 与商家后端（小程序后端）部署在同一台机器上，但两边订单互不可见。
//       本模块把 H5 已收款的订单投递进商家后端的订单管道，从而自动获得：
//         ① 企业微信群通知商家   ② 分派到门店（真实履约）  ③ 商家后台可见
//       —— 这三件事商家后端本来就有，我们只需把订单送进去。
//
// 架构约束（决定了这里的每个取舍）：
//   · **H5 必须保留自己的收款**：商家后端 pay-prepare 的 sp_appid 是小程序 appid，
//     H5 用户只有服务号 openid，支付通道无法交接。所以本模块**从不调用** pay-prepare，
//     而是在 H5 收款成功后调 `PUT /v1/orders/pay-success` 告知商家"已收款"。
//   · **资金执行权只在 H5**：商家后端的退款接口会对 H5 单跳过微信调用（见
//     docs/退款审核与订单同步-实施方案.md §9），我们只读取它的审核结果。
//   · **幂等**：以 H5 订单号作为商家订单 id，商家侧 ON DUPLICATE KEY 天然去重；
//     本模块再叠一层 merchant_sync_state 状态机，避免重复投递。
//
// 开关（全部默认关闭，改 .env 后重启 twlh5-api 生效）：
//   MERCHANT_BRIDGE_ENABLED       = true            总开关
//   MERCHANT_BRIDGE_BASE          = http://127.0.0.1:3457   商家后端地址（测试端 3457 / 生产 3456）
//   MERCHANT_BRIDGE_PUBLIC_BASE   = https://h5.tiaowulan.com 相对资源（如 DIY 效果图）拼接基址
//   MERCHANT_BRIDGE_AMOUNT_GUARD  = warn | block    金额不一致时的处置
//   MERCHANT_BRIDGE_SERVICE_TOKEN = （待同事提供）服务间令牌；留空则退回手机号登录
// ============================================================================
import { hq } from './h5db.js'

const ENABLED = String(process.env.MERCHANT_BRIDGE_ENABLED || '').toLowerCase() === 'true'
const BASE = String(process.env.MERCHANT_BRIDGE_BASE || 'http://127.0.0.1:3457').replace(/\/+$/, '')
const PUBLIC_BASE = String(process.env.MERCHANT_BRIDGE_PUBLIC_BASE || 'https://h5.tiaowulan.com').replace(/\/+$/, '')
const TIMEOUT_MS = Math.max(2000, Number(process.env.MERCHANT_BRIDGE_TIMEOUT_MS || 10000))
const SCAN_MS = Math.max(60000, Number(process.env.MERCHANT_BRIDGE_SCAN_MS || 5 * 60 * 1000))
const AMOUNT_GUARD = String(process.env.MERCHANT_BRIDGE_AMOUNT_GUARD || 'warn').toLowerCase()
// 过渡期：商家后端目前只有「手机号 + 万能验证码」这条能拿到用户态 token 的路。
// 已请同事提供服务间令牌（X-Service-Token）；拿到后填 MERCHANT_BRIDGE_SERVICE_TOKEN 即可切换。
const SERVICE_TOKEN = String(process.env.MERCHANT_BRIDGE_SERVICE_TOKEN || '').trim()
const LOGIN_CODE = String(process.env.MERCHANT_BRIDGE_LOGIN_CODE || '888888')
const MAX_ATTEMPTS = Math.max(1, Number(process.env.MERCHANT_BRIDGE_MAX_ATTEMPTS || 5))

export const MB = {
  enabled: ENABLED,
  base: BASE,
  publicBase: PUBLIC_BASE,
  amountGuard: AMOUNT_GUARD,
  scanMs: SCAN_MS,
  useServiceToken: !!SERVICE_TOKEN
}

/** 视为「已收款、可以投递给商家」的 H5 订单状态 */
const PUSHABLE = ['paid', 'making', 'delivering', 'completed']
/** 商家侧状态 → H5 状态（仅用于**向前**同步，绝不回退） */
const MERCHANT_TO_H5 = {
  new: null,
  pending: null,          // 待接单：H5 的 paid 已表达，无需改
  paid: null,             // 已接单：H5 无对应状态，只记录 merchant_status
  making: 'making',
  delivering: 'delivering',
  completed: 'completed',
  refunding: null, refunded: null, refund_failed: null, cancelled: null
}
const H5_RANK = { pending: 0, paid: 1, making: 2, delivering: 3, completed: 4 }

function log(...a) { console.log('[商家桥接]', ...a) }
function warn(...a) { console.warn('[商家桥接]', ...a) }

// ---------------------------------------------------------------- HTTP 工具
async function mfetch(path, { method = 'GET', body, token, timeout } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout || TIMEOUT_MS)
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = 'Bearer ' + token
  if (SERVICE_TOKEN) headers['X-Service-Token'] = SERVICE_TOKEN
  try {
    const res = await fetch(BASE + path, {
      method, headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch (e) { /* 保留 text */ }
    return { ok: res.ok, status: res.status, json, text }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------- 资源地址归一
/**
 * 把相对资源路径转成绝对 URL。
 * H5 的 DIY 效果图是 `/agent/generated/xxx.png`（由 server.cjs 反代），
 * 而商家后端的 getDanceOrchidProductImage() 只对**绝对 URL 原样透传**，
 * 相对路径会被拼到它的 publicBaseUrl（aistore）上 —— 那是错的，必须在这里转掉。
 * 幂等：已是绝对 URL 直接返回。
 */
export function toAbsoluteAssetUrl(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (v.startsWith('//')) return 'https:' + v
  if (v.startsWith('/')) return PUBLIC_BASE + v
  return PUBLIC_BASE + '/' + v
}

// ---------------------------------------------------------------- 地址解析
const REGION_PROV = /^(.*?(?:省|自治区|特别行政区))/
const REGION_CITY = /^(.*?(?:市|自治州|地区|盟))/
const REGION_DIST = /^(.*?(?:区|县|旗|市))/
const MUNICIPALITY = /^(北京|上海|天津|重庆)(?:市)?/

/**
 * 把 H5 的 `addr_region`（形如「广东省深圳市盐田区」）拆成省/市/区。
 * 商家后端的 getDeliveryAddressCity() 用的就是 address.city，且它会自己剥离省份前缀，
 * 所以即使落到 fallback（整串塞进 city）也能正确取到城市。
 */
export function parseRegion(region) {
  const raw = String(region || '').replace(/\s+/g, '')
  const out = { province: '', city: '', district: '' }
  if (!raw) return out
  let rest = raw
  const p = rest.match(REGION_PROV)
  if (p) { out.province = p[1]; rest = rest.slice(p[1].length) }
  const m = rest.match(MUNICIPALITY)
  if (m) {
    out.province = out.province || m[1] + '市'
    out.city = m[1] + '市'
    rest = rest.slice(m[0].length)
  } else {
    const c = rest.match(REGION_CITY)
    if (c) { out.city = c[1]; rest = rest.slice(c[1].length) }
  }
  const d = rest.match(REGION_DIST)
  if (d) { out.district = d[1]; rest = rest.slice(d[1].length) }
  // 兜底：一定要给出非空 city，否则商家后端会以「收货地址缺少城市信息」拒绝
  if (!out.city) out.city = raw
  return out
}

// ---------------------------------------------------------------- 商家 token
const tokenCache = new Map()   // phone -> { token, at }
const TOKEN_TTL_MS = 20 * 60 * 60 * 1000

/** 取订单对应的手机号：优先 H5 账号手机号，其次收货人手机号（游客单） */
async function resolvePhone(orderId, row) {
  if (row.user_id) {
    const u = await hq('SELECT phone FROM users WHERE id = ? LIMIT 1', [row.user_id])
    if (u && u[0] && u[0].phone) return String(u[0].phone)
  }
  return String(row.addr_phone || '')
}

async function merchantToken(phone) {
  const cached = tokenCache.get(phone)
  if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token
  const r = await mfetch('/v1/auth/phone-login', {
    method: 'POST',
    body: { phone, code: LOGIN_CODE }
  })
  const token = r.json && r.json.data && r.json.data.token
  if (!token) {
    throw new Error('商家侧登录失败：' + ((r.json && r.json.message) || ('HTTP ' + r.status)))
  }
  tokenCache.set(phone, { token, at: Date.now() })
  return token
}

// ---------------------------------------------------------------- 状态落库
async function markSync(orderId, state, patch = {}) {
  const sets = ['merchant_sync_state = ?', 'merchant_sync_at = NOW()', 'merchant_sync_attempts = merchant_sync_attempts + 1']
  const args = [state]
  if (patch.error !== undefined) { sets.push('merchant_sync_error = ?'); args.push(String(patch.error || '').slice(0, 255)) }
  if (patch.merchantOrderId !== undefined) { sets.push('merchant_order_id = ?'); args.push(patch.merchantOrderId) }
  if (patch.merchantStatus !== undefined) { sets.push('merchant_status = ?', 'merchant_status_at = NOW()'); args.push(patch.merchantStatus) }
  if (patch.merchantAmount !== undefined) { sets.push('merchant_amount = ?'); args.push(patch.merchantAmount) }
  args.push(orderId)
  await hq('UPDATE orders SET ' + sets.join(', ') + ' WHERE id = ?', args)
}

// ---------------------------------------------------------------- 订单投递
/**
 * 把一笔已收款的 H5 订单投递给商家后端。
 * 幂等：已 success 直接返回；以 H5 订单号为商家订单 id。
 * @returns {Promise<{ok:boolean, skipped?:string, status?:string, message?:string}>}
 */
export async function submitOrder(orderId) {
  if (!ENABLED) return { ok: false, skipped: 'disabled' }

  const rows = await hq('SELECT * FROM orders WHERE id = ? LIMIT 1', [orderId])
  const row = rows && rows[0]
  if (!row) return { ok: false, skipped: 'order_not_found' }
  if (row.merchant_sync_state === 'success') return { ok: true, skipped: 'already_synced' }
  if (!PUSHABLE.includes(row.status)) return { ok: false, skipped: 'not_paid:' + row.status }

  const phone = await resolvePhone(orderId, row)
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    await markSync(orderId, 'failed', { error: '缺少可用手机号，无法在商家侧建立身份' })
    return { ok: false, status: 'failed', message: '缺少可用手机号' }
  }

  const itemRows = await hq(
    'SELECT product_id, name, subtitle, image, price, quantity FROM order_items WHERE order_id = ? ORDER BY id',
    [orderId]
  )
  if (!itemRows || !itemRows.length) {
    await markSync(orderId, 'failed', { error: '订单无商品明细' })
    return { ok: false, status: 'failed', message: '订单无商品明细' }
  }

  const isPickup = String(row.pickup_method || '') === 'pickup'
  const region = parseRegion(row.addr_region)
  const address = {
    name: String(row.addr_name || ''),
    phone: String(row.addr_phone || ''),
    province: region.province,
    city: region.city,
    district: region.district,
    detail: String(row.addr_detail || ''),
    fullAddress: String(row.addr_region || '') + String(row.addr_detail || '')
  }

  const payload = {
    source: 'h5',                        // ★ 渠道标记：商家侧据此对 H5 单禁用资金操作
    shopId: String(row.shop_id || ''),
    items: itemRows.map(it => ({
      id: String(it.product_id),
      name: String(it.name || ''),
      subtitle: String(it.subtitle || ''),
      price: Number(it.price) || 0,      // 单位：分（与商家侧一致）
      quantity: Number(it.quantity) || 1,
      // ★ DIY 效果图随商品一并发给门店（必须是绝对 URL，见 toAbsoluteAssetUrl 注释）
      image: toAbsoluteAssetUrl(it.image)
    })),
    address,
    pickupMethod: isPickup ? 'pickup' : 'delivery',
    pickupContact: isPickup ? { name: String(row.addr_name || ''), phone: String(row.addr_phone || '') } : undefined,
    remark: String(row.remark || ''),
    cardContent: String(row.card_content || ''),
    expectDeliveryTime: String(row.expect_delivery || '')
  }

  let token
  try {
    token = await merchantToken(phone)
  } catch (e) {
    await markSync(orderId, 'failed', { error: '登录失败：' + (e.message || e) })
    return { ok: false, status: 'failed', message: '商家侧登录失败：' + (e.message || e) }
  }

  // ---- ① 创建商家侧订单 ----
  let created
  try {
    created = await mfetch('/v1/orders/create', { method: 'POST', body: payload, token })
  } catch (e) {
    await markSync(orderId, 'failed', { error: '投递失败：' + (e.message || e) })
    return { ok: false, status: 'failed', message: '投递失败：' + (e.message || e) }
  }

  const cj = created.json || {}
  if (Number(cj.code) !== 0) {
    // 商家侧带语义的错误码：2=门店休息 3=跨城/地址问题 401=需登录
    const why = (cj.message || ('HTTP ' + created.status))
    await markSync(orderId, 'rejected', { error: '商家侧拒单(' + cj.code + ')：' + why })
    warn('商家侧拒单', orderId, cj.code, why)
    return { ok: false, status: 'rejected', code: cj.code, message: why }
  }

  const merchantOrderId = String((cj.data && cj.data.id) || orderId)
  const merchantTotal = Number((cj.data && cj.data.totalPrice) || 0)

  // ---- ② 金额校验（满减口径必须两边一致，否则退款金额会错）----
  const h5Total = Number(row.total_price) || 0
  if (merchantTotal && merchantTotal !== h5Total) {
    const msg = '金额不一致：H5=' + h5Total + '分，商家=' + merchantTotal + '分'
    warn(orderId, msg)
    await markSync(orderId, 'amount_mismatch', {
      error: msg, merchantOrderId, merchantAmount: merchantTotal
    })
    if (AMOUNT_GUARD === 'block') {
      return { ok: false, status: 'amount_mismatch', message: msg }
    }
  }

  // ---- ③ 告知商家「已收款」→ 触发企业微信通知 + 门店派单 ----
  try {
    const pr = await mfetch('/v1/orders/pay-success', { method: 'PUT', body: { id: merchantOrderId }, token })
    const pj = pr.json || {}
    if (Number(pj.code) !== 0) {
      await markSync(orderId, 'paid_failed', {
        error: 'pay-success 失败：' + (pj.message || ('HTTP ' + pr.status)),
        merchantOrderId, merchantAmount: merchantTotal
      })
      return { ok: false, status: 'paid_failed', message: pj.message || 'pay-success 失败' }
    }
  } catch (e) {
    await markSync(orderId, 'paid_failed', {
      error: 'pay-success 异常：' + (e.message || e), merchantOrderId, merchantAmount: merchantTotal
    })
    return { ok: false, status: 'paid_failed', message: String(e.message || e) }
  }

  await markSync(orderId, 'success', { merchantOrderId, merchantAmount: merchantTotal })
  log('订单已投递', orderId, '→', merchantOrderId, '金额', merchantTotal, '分')
  return { ok: true, status: 'success', merchantOrderId, merchantTotal }
}

/**
 * 支付成功后的非阻塞触发。
 * 🔴 绝不能让桥接失败影响到支付落库 —— 所以这里 setTimeout 出来、异常只记日志。
 */
export function notifyOrderPaid(orderId) {
  if (!ENABLED) return
  setTimeout(() => {
    submitOrder(orderId).catch(e => warn('投递异常（不影响支付）', orderId, e && e.message))
  }, 0)
}

// ---------------------------------------------------------------- 状态回捞
/**
 * 回捞商家侧状态并**仅向前**同步到 H5 订单（不会把已完成回退成制作中）。
 * 同时把商家状态、退款审核结果写回，供订单详情展示。
 */
export async function pullMerchantStatus(orderId) {
  if (!ENABLED) return { ok: false, skipped: 'disabled' }
  const rows = await hq('SELECT * FROM orders WHERE id = ? LIMIT 1', [orderId])
  const row = rows && rows[0]
  if (!row) return { ok: false, skipped: 'order_not_found' }
  const mid = String(row.merchant_order_id || (row.merchant_sync_state === 'success' ? orderId : ''))
  if (!mid) return { ok: false, skipped: 'not_submitted' }

  let r
  try {
    r = await mfetch('/v1/orders/detail?id=' + encodeURIComponent(mid))
  } catch (e) {
    return { ok: false, message: String(e.message || e) }
  }
  const order = r.json && r.json.data
  if (!order) return { ok: false, message: '商家侧订单不存在' }

  const mStatus = String(order.status || '')
  const audit = order.refundAudit && order.refundAudit.status ? String(order.refundAudit.status) : null

  await markSync(orderId, row.merchant_sync_state || 'success', {
    merchantStatus: mStatus,
    ...(audit ? {} : {})
  })
  if (audit) {
    await hq(
      'UPDATE orders SET merchant_refund_audit = ?, merchant_refund_audit_at = NOW() WHERE id = ?',
      [audit, orderId]
    )
  }

  // 仅向前推进 H5 状态
  const target = MERCHANT_TO_H5[mStatus]
  if (target && (H5_RANK[target] || 0) > (H5_RANK[row.status] || 0)) {
    await hq('UPDATE orders SET status = ? WHERE id = ?', [target, orderId])
    log('状态向前同步', orderId, row.status, '→', target, '(商家=' + mStatus + ')')
  }
  return { ok: true, merchantStatus: mStatus, refundAudit: audit }
}

// ---------------------------------------------------------------- 退款投递
/**
 * 把 H5 的退款申请投递给商家，让商家在后台审核。
 * 调用方（orders.js）负责先把 H5 订单原子占位为 refund_applying。
 */
export async function submitRefundRequest(orderId) {
  if (!ENABLED) return { ok: false, skipped: 'disabled' }
  const rows = await hq('SELECT * FROM orders WHERE id = ? LIMIT 1', [orderId])
  const row = rows && rows[0]
  if (!row) return { ok: false, skipped: 'order_not_found' }
  const mid = String(row.merchant_order_id || orderId)

  const phone = await resolvePhone(orderId, row)
  let token
  try { token = await merchantToken(phone) } catch (e) {
    return { ok: false, message: '商家侧登录失败：' + (e.message || e) }
  }
  // 商家侧只置 refunding（待审核），它不会对 H5 单执行微信退款
  const r = await mfetch('/v1/orders/refund', { method: 'PUT', body: { id: mid }, token })
  const j = r.json || {}
  return { ok: Number(j.code) === 0, status: 'submitted', message: j.message }
}

/**
 * 读取商家侧的退款审核结果。
 * @returns {Promise<{ok:boolean, audit?:'approved'|'rejected'|null, reason?:string}>}
 */
export async function pollRefundAudit(orderId) {
  if (!ENABLED) return { ok: false, skipped: 'disabled' }
  const rows = await hq('SELECT merchant_order_id FROM orders WHERE id = ? LIMIT 1', [orderId])
  const mid = String((rows && rows[0] && rows[0].merchant_order_id) || orderId)
  const r = await mfetch('/v1/orders/detail?id=' + encodeURIComponent(mid))
  const order = r.json && r.json.data
  if (!order) return { ok: false, message: '商家侧订单不存在' }
  const a = order.refundAudit || {}
  const audit = a.status || null
  if (audit) {
    await hq(
      'UPDATE orders SET merchant_refund_audit = ?, merchant_refund_audit_at = NOW() WHERE id = ?',
      [audit, orderId]
    )
  }
  return { ok: true, audit, reason: a.reason || '', at: a.at || '' }
}

// ---------------------------------------------------------------- 补偿扫描
let _started = false
/**
 * 补偿扫描：处理「hook 没跑到」「商家后端当时不可用」等漏投。
 * 与 profitsharing 的扫描器同一模式。
 */
export async function scanOnce(limit = 10) {
  const rows = await hq(
    `SELECT id FROM orders
      WHERE status IN ('paid','making','delivering','completed')
        AND (merchant_sync_state IS NULL
             OR merchant_sync_state IN ('failed','rejected','paid_failed','amount_mismatch'))
        AND merchant_sync_attempts < ?
        AND create_time > DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY create_time ASC LIMIT ?`,
    [MAX_ATTEMPTS, limit]
  )
  let ok = 0, fail = 0
  for (const r of rows || []) {
    try {
      const res = await submitOrder(r.id)
      res.ok ? ok++ : fail++
    } catch (e) { fail++ }
  }
  if (ok || fail) log('补偿扫描：成功 %d / 失败 %d', ok, fail)
  return { ok, fail, total: (rows || []).length }
}

export function startMerchantBridgeScanner() {
  if (!ENABLED) {
    console.log('[商家桥接] 未启用（MERCHANT_BRIDGE_ENABLED != true）→ H5 订单不会投递给商家')
    return
  }
  if (_started) return
  _started = true
  const tick = () => scanOnce().catch(e => warn('扫描异常：', e && e.message))
  const timer = setInterval(tick, SCAN_MS)
  if (timer.unref) timer.unref()
  setTimeout(tick, 15 * 1000)
  log('已启用：投递目标 %s，每 %d 分钟补偿扫描一次；登录方式=%s',
    BASE, Math.round(SCAN_MS / 60000), SERVICE_TOKEN ? '服务令牌' : '手机号（过渡）')
}

/** 供 /api/health 暴露状态，便于运维自检 */
export function merchantBridgeInfo() {
  return {
    enabled: ENABLED,
    base: BASE,
    publicBase: PUBLIC_BASE,
    amountGuard: AMOUNT_GUARD,
    loginMode: SERVICE_TOKEN ? 'service-token' : 'phone-login',
    scanMs: SCAN_MS
  }
}
