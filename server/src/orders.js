// H5 订单读写（h5_shop.orders / order_items）——真正落库，替代 mock 订单
// 金额一律 INT「分」；服务端按下单快照重算金额，不信任前端 totalPrice（防改价）
// 状态语义（DB → 前端）：
//   DB  pending 待支付（未支付可取消）   → 前端展示 new(待付款)
//   DB  paid    已支付/待接单            → 前端展示 pending(待接单)
//   making/delivering/completed/cancelled/refunding/refunded/refund_failed 同名透传
// 鉴权（过渡）：Authorization: Bearer <guestId|openid> → users 表解析 user_id
import express from 'express'
import { hq, withTx } from './h5db.js'
import { resolveUser as resolveTokenUser } from './token.js'
import { toFlower, storeAllFlowers } from './store.js'
import { refundOrderCore } from './pay.js'
import { submitRefundRequest, pollRefundAudit } from './merchantBridge.js'
import { checkCityMatch } from './cityGuard.js'

/**
 * 退款走「商家人工审核」的开关。
 * 🔴 打开前必须确认：商家后端的 refund-approve 已改成**对 H5 单只标记、不执行微信退款**
 *    （见 docs/退款审核与订单同步-实施方案.md §9），否则会出现「钱不动、状态卡住」。
 * 关闭时，退款保持原有「用户申请即立即退款」的行为，完全不变。
 */
const REFUND_REVIEW = String(process.env.MERCHANT_REFUND_REVIEW_ENABLED || '').toLowerCase() === 'true'
/** 运营兜底审核令牌（商家侧无法处理时由 H5 侧放行）；留空 = 该组接口整体关闭 */
const REFUND_ADMIN_TOKEN = String(process.env.MERCHANT_REFUND_ADMIN_TOKEN || '')
export const refundReviewInfo = () => ({ enabled: REFUND_REVIEW, adminApi: !!REFUND_ADMIN_TOKEN })

const router = express.Router()

// DB status → 前端 status（前端页面渲染以此为准：new=待付款 显示去支付/取消）
const FRONT_STATUS = {
  pending: 'new', paid: 'pending',
  making: 'making', delivering: 'delivering', completed: 'completed',
  cancelled: 'cancelled', refunding: 'refunding', refunded: 'refunded', refund_failed: 'refund_failed',
  // 退款审核中：已提交申请、等待商家审核，资金尚未发生任何变动。
  // 🔴 语义必须与 refunding（已通过、正在退）严格区分，否则用户会以为钱在路上。
  refund_applying: 'refund_applying'
}
const STATUS_TEXT = {
  new: '待付款', pending: '待接单', making: '制作中', delivering: '配送中',
  completed: '已完成', cancelled: '已取消', refunding: '退款中',
  refunded: '已退款', refund_failed: '退款失败',
  refund_applying: '退款审核中'
}
/** 商家侧履约状态 → 展示文案（订单详情「商家进度」用） */
const MERCHANT_STATUS_TEXT = {
  new: '商家待支付', pending: '商家待接单', paid: '商家已接单',
  making: '制作中', delivering: '配送中', completed: '已完成',
  refunding: '商家处理退款中', refunded: '商家已退款', refund_failed: '退款失败', cancelled: '商家已取消'
}

/**
 * 满减规则（单位：分）—— **以小程序后端 /opt/flower-shop 为准，两边必须完全一致**。
 * 对齐的是商家后端 server.js::calcFullReduction()。不一致会导致：
 *   ① 商家后台显示的金额与 H5 实付不符（用户在 H5 看到与商家看到的不是同一个数）
 *   ② 商家按它自己的 totalPrice 发起退款 → 退款金额多退或少退
 * 🔴 改动此处必须同步改 /opt/flower-shop/server.js 的 calcFullReduction，反之亦然。
 */
function fullReduction(fen) {
  if (fen >= 30000) return 3000 // 满 ¥300 减 ¥30
  if (fen >= 20000) return 2000 // 满 ¥200 减 ¥20
  if (fen >= 10000) return 1000 // 满 ¥100 减 ¥10
  return 0
}

// 前端 tab status → DB 状态集合（null = 全部）
function dbStatuses(status) {
  switch (status) {
    case 'new': return ['pending'] // 待付款
    case 'pending': return ['paid'] // 待接单（已支付）
    case 'making': return ['making']
    case 'delivering': return ['delivering']
    case 'completed': return ['completed']
    case 'review': return ['completed'] // 暂无评价系统：已完成即视为待评价
    case 'refund': return ['refund_applying', 'refunding', 'refunded', 'refund_failed']
    case 'cancelled': return ['cancelled']
    default: return null
  }
}

/** 解析 Bearer token → user id（数字）；无效返回 null（兼容 guest_id 原文 / JWT） */
async function resolveUser(req) {
  const u = await resolveTokenUser(req)
  return u ? Number(u.id) : null
}

function pad(n) { return n < 10 ? '0' + n : String(n) }
/** 业务单号：T + yyyyMMddHHmmss + 3 位随机 */
function genOrderNo() {
  const d = new Date()
  const ts = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
  return 'T' + ts + String(Math.floor(Math.random() * 900) + 100)
}

/** 商品 id → 权威价格（分）。来源 aistore 商品库（storeAllFlowers 带 TTL 缓存）。
 *  下单计价必须用它，绝不信任客户端传入的 price（防改价）。 */
async function loadAuthoritativePrices() {
  const all = await storeAllFlowers()
  const map = new Map()
  for (const row of all || []) {
    const f = toFlower(row)
    if (f && f.id) map.set(String(f.id), Number(f.price) || 0)
  }
  return map
}

/** DB 订单行 + 明细 → 前端订单形状 */
function toFront(o, items = []) {
  const fs = FRONT_STATUS[o.status] || o.status || 'new'
  return {
    id: o.id,
    shopId: o.shop_id || '',
    shopName: o.shop_name || '',
    status: fs,
    statusText: STATUS_TEXT[fs] || fs,
    items: (items || []).map(it => ({
      id: it.product_id,
      name: it.name,
      subtitle: it.subtitle || '',
      image: it.image || '',
      price: Number(it.price) || 0,
      quantity: Number(it.quantity) || 1
    })),
    totalPrice: Number(o.total_price) || 0,
    createTime: o.create_time || '',
    expectDeliveryTime: o.expect_delivery || '',
    pickupMethod: o.pickup_method || 'delivery',
    cardContent: o.card_content || '',
    remark: o.remark || '',
    payTime: o.pay_time || '',
    address: {
      name: o.addr_name || '',
      phone: o.addr_phone || '',
      region: o.addr_region || '',
      detail: o.addr_detail || ''
    },
    // 退款明细（有则透出，前端订单详情据此展示「退款信息」）
    refund: (o.refund_no || o.refund_amount || o.refund_reason) ? {
      no: o.refund_no || '',
      amount: Number(o.refund_amount) || 0,
      reason: o.refund_reason || '',
      message: o.refund_message || '',
      applyTime: o.refund_apply_time || '',
      time: o.refund_time || ''
    } : null,
    deliveryInfo: null,
    // 商家侧履约进度（订单投递成功后才有；前端订单详情据此展示「商家进度」）
    merchant: o.merchant_sync_state === 'success' ? {
      synced: true,
      status: o.merchant_status || '',
      statusText: MERCHANT_STATUS_TEXT[o.merchant_status] || o.merchant_status || '',
      statusAt: o.merchant_status_at || '',
      refundAudit: o.merchant_refund_audit || '',
      refundAuditText: o.merchant_refund_audit === 'approved' ? '商家已同意'
        : (o.merchant_refund_audit === 'rejected' ? '商家已拒绝' : '')
    } : {
      synced: false,
      // 已收款却还没送达商家：前端可提示「正在通知门店」，避免用户以为没人管
      pendingSync: ['paid', 'making', 'delivering', 'completed'].includes(o.status),
      error: o.merchant_sync_error || ''
    }
  }
}

/** 按订单 id 批量取明细，返回 Map<orderId, items[]> */
async function loadItems(orderIds) {
  const map = new Map()
  if (!orderIds.length) return map
  const ph = orderIds.map(() => '?').join(',')
  const rows = await hq(
    `SELECT * FROM order_items WHERE order_id IN (${ph}) ORDER BY id ASC`, orderIds
  )
  rows.forEach(r => {
    const k = r.order_id
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(r)
  })
  return map
}

// ==================== 下单（快照 + 服务端计价） ====================
// body: {
//   shopId, shopName?,
//   items: [{ id, name, subtitle?, image?, price(分), quantity }],
//   address?: { name, phone, region?, detail }, expectDeliveryTime?, pickupMethod?, cardContent?, remark?
//   pickupName?, pickupPhone?   (pickup 模式联系人)
// }
router.post('/', async (req, res) => {
  let userId
  try { userId = await resolveUser(req) } catch (e) { /* 下游客单仍允许（游客 user_id NULL） */ }
  const b = (req.body && typeof req.body === 'object') ? req.body : {}
  const shopId = String(b.shopId || '').trim()
  const items = Array.isArray(b.items) ? b.items : []
  if (!shopId) return res.status(400).json({ error: 'missing shopId' })
  if (!items.length) return res.status(400).json({ error: 'missing items' })
  const cleanItems = []
  for (const it of items) {
    const id = String((it && (it.id || it.product_id)) || '').trim()
    const price = Math.round(Number(it && it.price) || 0)
    const qty = Math.round(Number(it && it.quantity) || 0)
    if (!id || price < 0 || qty < 1) return res.status(400).json({ error: 'bad item: ' + id })
    cleanItems.push({
      id,
      name: String(it.name || '').slice(0, 128),
      subtitle: String(it.subtitle || '').slice(0, 255),
      image: String(it.image || '').slice(0, 512),
      price,
      quantity: qty > 99 ? 99 : qty
    })
  }
  // —— 服务端权威定价（防改价）：按商品库实际价格计价，覆盖客户端传入的 price ——
  let priceMap
  try {
    priceMap = await loadAuthoritativePrices()
  } catch (e) {
    console.error('[orders] 商品价格校验失败：', e && e.message)
    return res.status(503).json({ error: '商品价格校验失败，请稍后重试' })
  }
  for (const it of cleanItems) {
    const real = priceMap.get(String(it.id))
    if (real == null) return res.status(400).json({ error: '商品不存在或已下架：' + (it.name || it.id) })
    it.price = real // 以库价为准
  }
  // 服务端计价（分）：商品小计 - 满减（规则见 fullReduction，与前端 Checkout 一致）
  const itemTotal = cleanItems.reduce((s, it) => s + it.price * it.quantity, 0)
  const deliveryFee = 0
  const discount = fullReduction(itemTotal)
  const totalPrice = itemTotal + deliveryFee - discount

  const pickupMethod = b.pickupMethod === 'pickup' ? 'pickup' : 'delivery'
  const addr = (b.address && typeof b.address === 'object') ? b.address : {}
  const pickupName = String(b.pickupName || '').trim() || String(addr.name || '').trim()
  const pickupPhone = String(b.pickupPhone || '').trim() || String(addr.phone || '').trim()

  // 🔴 下单前城市校验（配送单）：
  //    商家后端 orders/create 会按「收货城市 == 门店服务城市」硬校验并拒单。
  //    不在这里拦，用户就会「付款成功、商家收不到单」—— 比不接通更糟。
  //    自提单跳过（无收货地址，城市无从校验）。
  if (pickupMethod === 'delivery') {
    const guard = await checkCityMatch(shopId, addr)
    if (!guard.ok) {
      return res.status(409).json({
        error: guard.message,
        code: 'CITY_MISMATCH',
        shopCity: guard.shopCity,
        addrCity: guard.addrCity
      })
    }
  }

  const orderNo = genOrderNo()
  try {
    await withTx(async conn => {
      await conn.query(
        `INSERT INTO orders
          (id, user_id, shop_id, shop_name, status, item_total, delivery_fee, total_price,
           addr_name, addr_phone, addr_region, addr_detail, expect_delivery, pickup_method,
           card_content, remark)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNo, userId, shopId, String(b.shopName || '').slice(0, 64),
          itemTotal, deliveryFee, totalPrice,
          pickupMethod === 'pickup' ? pickupName : String(addr.name || '').slice(0, 32),
          pickupMethod === 'pickup' ? pickupPhone : String(addr.phone || '').slice(0, 20),
          String(addr.region || '').slice(0, 128),
          pickupMethod === 'pickup' ? '到店自取' : String(addr.detail || '').slice(0, 255),
          String(b.expectDeliveryTime || '').slice(0, 64),
          pickupMethod,
          String(b.cardContent || '').slice(0, 500),
          String(b.remark || '').slice(0, 255)
        ]
      )
      for (const it of cleanItems) {
        await conn.query(
          `INSERT INTO order_items (order_id, product_id, name, subtitle, image, price, quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [orderNo, it.id, it.name, it.subtitle, it.image, it.price, it.quantity]
        )
      }
    })
    const row = { id: orderNo, status: 'pending', total_price: totalPrice, create_time: '' }
    const o = toFront(row)
    res.json({ id: o.id, status: o.status, statusText: o.statusText, totalPrice: o.totalPrice })
  } catch (e) {
    console.error('[orders] 下单失败：', e.message)
    res.status(500).json({ error: String(e.message || e) })
  }
})

// ==================== 订单列表（我的订单） ====================
// GET /api/orders?status=all|new|pending|making|delivering|completed|review|refund&page=&pageSize=
router.get('/', async (req, res) => {
  const userId = await resolveUser(req)
  if (!userId) return res.status(401).json({ error: 'unauthorized' })
  try {
    const status = String(req.query.status || 'all')
    const statuses = dbStatuses(status)
    const p = Math.max(1, parseInt(req.query.page) || 1)
    const ps = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20))
    const where = ['user_id = ?']
    const params = [userId]
    if (statuses) {
      where.push(`status IN (${statuses.map(() => '?').join(',')})`)
      params.push(...statuses)
    }
    const rows = await hq(
      `SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY create_time DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, ps, (p - 1) * ps]
    )
    const itemMap = await loadItems(rows.map(r => r.id))
    res.json({ list: rows.map(r => toFront(r, itemMap.get(r.id))), total: rows.length })
  } catch (e) {
    console.error('[orders] 列表失败：', e.message)
    res.status(500).json({ error: String(e.message || e) })
  }
})

// ==================== 订单详情 ====================
router.get('/:id', async (req, res) => {
  const userId = await resolveUser(req)
  if (!userId) return res.status(401).json({ error: 'unauthorized' })
  try {
    const rows = await hq('SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, userId])
    if (!rows.length) return res.status(404).json({ error: 'not found' })
    const itemRows = await hq('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', [req.params.id])
    res.json(toFront(rows[0], itemRows))
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

// ==================== 取消订单（仅待支付可取消） ====================
router.post('/:id/cancel', async (req, res) => {
  const userId = await resolveUser(req)
  if (!userId) return res.status(401).json({ error: 'unauthorized' })
  try {
    const r = await hq(
      "UPDATE orders SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'",
      [req.params.id, userId]
    )
    if (!r.affectedRows) {
      const rows = await hq('SELECT status FROM orders WHERE id = ? AND user_id = ?', [req.params.id, userId])
      const st = rows.length ? rows[0].status : 'gone'
      return res.json({ ok: false, error: st === 'pending' ? '取消失败' : '当前状态不可取消' })
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) })
  }
})

// ==================== 申请退款（用户端唯一入口） ====================
// 设计要点（每条都对应一次真实踩坑）：
//  ① **原子占位**：先把 status 从「可退」改成 refunding，只有 affectedRows>0 的那一次才真去调微信退款。
//     连点/并发/刷新重试都只会产生一笔退款。
//  ② **退款单号幂等**：out_refund_no 由订单号派生（见 pay.js refundOrderCore）→ 微信侧重复调用返回同一笔。
//  ③ **如实落库**：SUCCESS→refunded / PROCESSING→refunding / 其他→refund_failed，并记下退款单号、金额、原因、时间。
//     ⚠️ 历史上用户端直接调 /pay/refund，那接口只出账、不写 orders.status，
//        前端又只在内存里把状态改成 refunding → 实际「钱已退、系统仍显示已支付、还能反复申请」。
const REFUNDABLE_DB = ['paid', 'making', 'delivering', 'refund_failed']

// ==================== 退款审核模式（MERCHANT_REFUND_REVIEW_ENABLED=true 时生效） ====================
/**
 * 用户申请退款 → 只做原子占位（refund_applying），**资金一分不动**，
 * 然后把申请投递给商家，等商家在后台审核；审核通过后由 H5 执行微信退款。
 * 与原来「申请即退款」的差别只有一点：发起微信退款那一步被移到了审核之后。
 */
async function applyRefundWithReview(res, { id, userId, b }) {
  try {
    const rows = await hq('SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1', [id, userId])
    if (!rows.length) return res.status(404).json({ error: '订单不存在' })
    const ord = rows[0]
    if (!REFUNDABLE_DB.includes(ord.status)) {
      const fs = FRONT_STATUS[ord.status] || ord.status
      const inFlight = ['refund_applying', 'refunding', 'refunded'].includes(fs)
      return res.status(409).json({
        error: inFlight ? '该订单已在退款处理中' : ('当前状态不可申请退款（' + (STATUS_TEXT[fs] || ord.status) + '）'),
        status: fs, statusText: STATUS_TEXT[fs] || fs
      })
    }
    const total = Math.round(Number(ord.total_price) || 0)
    const wantFen = Math.round(Number(b.amountFen) || 0) || total
    if (!(wantFen > 0) || wantFen > total) {
      return res.status(400).json({ error: '退款金额不合法（应为 1 ~ ' + total + ' 分）' })
    }

    // ① 原子占位 → refund_applying，并记下原状态供「被拒」时恢复
    const lock = await hq(
      `UPDATE orders
          SET status = 'refund_applying', refund_prev_status = ?, refund_reason = ?, refund_amount = ?,
              refund_apply_time = NOW(), refund_updated_at = NOW(),
              refund_message = '已提交，等待商家审核'
        WHERE id = ? AND user_id = ? AND status IN ('paid','making','delivering','refund_failed')`,
      [ord.status, String(b.reason || '用户申请退款').slice(0, 255), wantFen, id, userId]
    )
    if (!lock.affectedRows) {
      return res.status(409).json({ error: '订单状态已变化，请刷新后重试', status: 'refund_applying', statusText: '退款审核中' })
    }
    // ② 进入退款流程即取消待分账（与无审核路径同一规则）
    await hq("UPDATE orders SET ps_state='cancelled', ps_updated_at=NOW() WHERE id=? AND ps_state='pending'", [id])

    // ③ 投递给商家审核。失败**不阻断**：申请已生效，补偿扫描会重投，运营也可后台兜底放行
    let ok = false, why = ''
    try {
      const r = await submitRefundRequest(id)
      ok = !!r.ok
      why = r.message || ''
    } catch (e) { why = String((e && e.message) || e) }
    if (!ok) {
      console.warn('[orders] 退款申请投递商家失败（保留待审状态，稍后自动重试）：', id, why)
      await hq('UPDATE orders SET refund_message = ? WHERE id = ?', ['已提交，等待审核', id])
    }
    return res.json({
      ok: true, status: 'refund_applying', statusText: '退款审核中',
      message: '退款申请已提交，等待商家审核', pendingReview: true
    })
  } catch (e) {
    console.error('[orders] 申请退款（审核模式）异常：', e && e.message)
    return res.status(500).json({ error: String((e && e.message) || e) })
  }
}

/** 审核通过 → H5 执行微信退款（**唯一出账点**）。幂等：状态前置校验 + out_refund_no 由订单号派生。 */
export async function executeApprovedRefund(id, { reason } = {}) {
  const rows = await hq('SELECT * FROM orders WHERE id = ? LIMIT 1', [id])
  const ord = rows && rows[0]
  if (!ord) return { ok: false, message: '订单不存在' }
  if (ord.status === 'refunded') return { ok: true, skipped: 'already_refunded' }
  if (ord.status !== 'refund_applying') return { ok: false, message: '订单不在待审核状态：' + ord.status }

  const wantFen = Math.round(Number(ord.refund_amount) || 0) || Math.round(Number(ord.total_price) || 0)
  let r
  try {
    r = await refundOrderCore(id, {
      reason: String(reason || ord.refund_reason || '用户申请退款'),
      amountFen: wantFen,
      shopId: ord.shop_id
    })
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 255)
    console.error('[orders] 审核通过后退款失败 order=%s：%s', id, msg)
    await hq("UPDATE orders SET status='refund_failed', refund_message=?, refund_updated_at=NOW() WHERE id=?",
      ['退款失败：' + msg, id])
    return { ok: false, message: msg }
  }
  const wx = String(r.wxStatus || '').toUpperCase()
  const finalDb = wx === 'SUCCESS' ? 'refunded' : (wx === 'PROCESSING' ? 'refunding' : 'refund_failed')
  await hq(
    `UPDATE orders
        SET status = ?, refund_no = ?, refund_amount = ?, refund_message = ?,
            refund_time = ${finalDb === 'refunded' ? 'NOW()' : 'NULL'},
            refund_updated_at = NOW()
      WHERE id = ?`,
    [finalDb, r.refundNo, r.amountFen, '微信退款状态：' + (wx || '未知'), id]
  )
  console.log('[orders] 审核通过已退款 order=%s 微信=%s → %s 退款号=%s 金额=%d分',
    id, wx || '未知', finalDb, r.refundNo, r.amountFen)
  const fs = FRONT_STATUS[finalDb]
  return { ok: true, status: fs, statusText: STATUS_TEXT[fs] || finalDb, refundNo: r.refundNo, amountFen: r.amountFen, wxStatus: wx }
}

/** 商家拒绝 → 恢复退款前的状态，订单继续履约 */
export async function rejectRefund(id, { reason } = {}) {
  const rows = await hq('SELECT * FROM orders WHERE id = ? LIMIT 1', [id])
  const ord = rows && rows[0]
  if (!ord) return { ok: false, message: '订单不存在' }
  if (ord.status !== 'refund_applying') return { ok: false, message: '订单不在待审核状态：' + ord.status }
  const back = ['paid', 'making', 'delivering', 'completed'].includes(ord.refund_prev_status) ? ord.refund_prev_status : 'paid'
  await hq(
    `UPDATE orders SET status = ?, refund_amount = 0, refund_reason = NULL,
            refund_message = ?, refund_updated_at = NOW() WHERE id = ?`,
    [back, '退款申请未通过：' + String(reason || '不符合退款条件').slice(0, 120), id]
  )
  console.log('[orders] 退款被拒，订单恢复为 %s：%s', back, id)
  return { ok: true, status: FRONT_STATUS[back] || back, statusText: STATUS_TEXT[FRONT_STATUS[back]] || back }
}

/**
 * 审核结果回收：扫描 refund_applying 的订单，读商家审核结果并落地。
 *   approved → H5 执行退款      rejected → 恢复订单状态
 * 由 index.js 定时调用（与分账扫描同一模式）。
 */
export async function reconcileRefundReviews(limit = 10) {
  if (!REFUND_REVIEW) return { skipped: 'disabled' }
  const rows = await hq(
    `SELECT id, merchant_refund_audit FROM orders
      WHERE status = 'refund_applying' AND refund_apply_time > DATE_SUB(NOW(), INTERVAL 30 DAY)
      ORDER BY refund_apply_time ASC LIMIT ?`,
    [limit]
  )
  let approved = 0, rejected = 0, pending = 0
  for (const r of rows || []) {
    let audit = r.merchant_refund_audit || null
    let reason = ''
    try {
      const p = await pollRefundAudit(r.id)
      audit = p.audit || audit
      reason = p.reason || ''
    } catch (e) { /* 商家不可达 → 下轮再试 */ }
    if (audit === 'approved') { const x = await executeApprovedRefund(r.id); if (x.ok) approved++ }
    else if (audit === 'rejected') { const x = await rejectRefund(r.id, { reason }); if (x.ok) rejected++ }
    else pending++
  }
  if (approved || rejected) console.log('[退款审核] 回收：通过 %d / 拒绝 %d / 待审 %d', approved, rejected, pending)
  return { approved, rejected, pending, total: (rows || []).length }
}

// ---------- 运营兜底审核（商家侧无法处理时使用，独立令牌） ----------
// 🔴 守卫「只发一次响应」：未配令牌 → 404（整组关闭）；令牌不符 → 401。
//    调用处一律写成 `if (!guardRefundAdmin(req, res)) return`，
//    绝不能再补一次 res.json —— 那会 ERR_HTTP_HEADERS_SENT 并**直接崩掉进程**（踩过）。
function guardRefundAdmin(req, res) {
  if (!REFUND_ADMIN_TOKEN) {
    res.status(404).json({ error: 'not found' })
    return false
  }
  if (String(req.headers['x-refund-token'] || '') !== REFUND_ADMIN_TOKEN) {
    res.status(401).json({ error: 'unauthorized' })
    return false
  }
  return true
}

router.get('/admin/refund/pending', async (req, res) => {
  if (!guardRefundAdmin(req, res)) return
  const rows = await hq(
    `SELECT id, shop_id, shop_name, refund_amount, refund_reason, refund_apply_time,
            merchant_order_id, merchant_status, merchant_refund_audit, refund_prev_status
       FROM orders WHERE status = 'refund_applying' ORDER BY refund_apply_time ASC LIMIT 200`
  )
  res.json({ list: rows })
})

router.post('/admin/refund/:id/approve', async (req, res) => {
  if (!guardRefundAdmin(req, res)) return
  const r = await executeApprovedRefund(String(req.params.id), { reason: (req.body || {}).reason })
  res.status(r.ok ? 200 : 409).json(r)
})

router.post('/admin/refund/:id/reject', async (req, res) => {
  if (!guardRefundAdmin(req, res)) return
  const r = await rejectRefund(String(req.params.id), { reason: (req.body || {}).reason })
  res.status(r.ok ? 200 : 409).json(r)
})

router.post('/:id/refund', async (req, res) => {
  const userId = await resolveUser(req)
  if (!userId) return res.status(401).json({ error: '请先登录后再申请退款', needLogin: true })
  const id = String(req.params.id || '')
  const b = (req.body && typeof req.body === 'object') ? req.body : {}
  // 审核模式：只占位 + 送审，不发起微信退款（资金执行权随后由审核结果驱动）
  if (REFUND_REVIEW) return applyRefundWithReview(res, { id, userId, b })
  try {
    const rows = await hq('SELECT * FROM orders WHERE id = ? AND user_id = ? LIMIT 1', [id, userId])
    if (!rows.length) return res.status(404).json({ error: '订单不存在' })
    const ord = rows[0]

    if (!REFUNDABLE_DB.includes(ord.status)) {
      const fs = FRONT_STATUS[ord.status] || ord.status
      const text = STATUS_TEXT[fs] || ord.status
      const msg = (fs === 'refunding' || fs === 'refunded') ? '该订单已在退款处理中' : ('当前状态不可申请退款（' + text + '）')
      return res.status(409).json({ error: msg, status: fs, statusText: text })
    }

    const total = Math.round(Number(ord.total_price) || 0)
    const wantFen = Math.round(Number(b.amountFen) || 0) || total
    if (!(wantFen > 0) || wantFen > total) {
      return res.status(400).json({ error: '退款金额不合法（应为 1 ~ ' + total + ' 分）' })
    }

    // —— ① 原子占位：改成功的那一次才继续往下走 ——
    const lock = await hq(
      `UPDATE orders
          SET status = 'refunding', refund_reason = ?, refund_amount = ?,
              refund_apply_time = NOW(), refund_updated_at = NOW(),
              refund_message = '已提交，退款处理中'
        WHERE id = ? AND user_id = ? AND status IN ('paid','making','delivering','refund_failed')`,
      [String(b.reason || '用户申请退款').slice(0, 255), wantFen, id, userId]
    )
    if (!lock.affectedRows) {
      return res.status(409).json({ error: '订单状态已变化，请刷新后重试', status: 'refunding', statusText: '退款中' })
    }

    // —— 占位成功即取消待分账：订单一旦进入退款流程就不允许再分账 ——
    //    （已分账成功/处理中的由 pay.js 的 ensureReturnedBeforeRefund 负责先回退资金）
    await hq("UPDATE orders SET ps_state='cancelled', ps_updated_at=NOW() WHERE id=? AND ps_state='pending'", [id])

    // —— ② 占位成功才真正发起微信退款 ——
    let r
    try {
      r = await refundOrderCore(id, {
        reason: String(b.reason || '用户申请退款'),
        amountFen: wantFen,
        shopId: ord.shop_id
      })
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 255)
      console.error('[orders] 退款失败 order=%s：%s', id, msg)
      await hq(
        "UPDATE orders SET status = 'refund_failed', refund_message = ?, refund_updated_at = NOW() WHERE id = ?",
        ['退款失败：' + msg, id]
      )
      return res.status(502).json({ error: '退款失败：' + msg, status: 'refund_failed', statusText: '退款失败' })
    }

    // —— ③ 按微信返回的真实状态落库 ——
    const wx = String(r.wxStatus || '').toUpperCase()
    const finalDb = wx === 'SUCCESS' ? 'refunded' : (wx === 'PROCESSING' ? 'refunding' : 'refund_failed')
    const fs = FRONT_STATUS[finalDb]
    await hq(
      `UPDATE orders
          SET status = ?, refund_no = ?, refund_amount = ?, refund_message = ?,
              refund_time = ${finalDb === 'refunded' ? 'NOW()' : 'NULL'},
              refund_updated_at = NOW()
        WHERE id = ?`,
      [finalDb, r.refundNo, r.amountFen, '微信退款状态：' + (wx || '未知'), id]
    )
    console.log('[orders] 退款 order=%s 微信=%s → 订单=%s 退款号=%s 金额=%d分',
      id, wx || '未知', finalDb, r.refundNo, r.amountFen)
    return res.json({
      ok: true, status: fs, statusText: STATUS_TEXT[fs] || finalDb,
      refundNo: r.refundNo, amountFen: r.amountFen, wxStatus: wx
    })
  } catch (e) {
    console.error('[orders] 申请退款异常：', e && e.message)
    res.status(500).json({ error: String((e && e.message) || e) })
  }
})

export default router