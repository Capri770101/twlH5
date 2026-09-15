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

const router = express.Router()

// DB status → 前端 status（前端页面渲染以此为准：new=待付款 显示去支付/取消）
const FRONT_STATUS = {
  pending: 'new', paid: 'pending',
  making: 'making', delivering: 'delivering', completed: 'completed',
  cancelled: 'cancelled', refunding: 'refunding', refunded: 'refunded', refund_failed: 'refund_failed'
}
const STATUS_TEXT = {
  new: '待付款', pending: '待接单', making: '制作中', delivering: '配送中',
  completed: '已完成', cancelled: '已取消', refunding: '退款中',
  refunded: '已退款', refund_failed: '退款失败'
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
    case 'refund': return ['refunding', 'refunded', 'refund_failed']
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
    deliveryInfo: null
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
  // 服务端计价（分）：商品小计 - 满减（与前端 Checkout 同规则：满 200 减 20）
  const itemTotal = cleanItems.reduce((s, it) => s + it.price * it.quantity, 0)
  const deliveryFee = 0
  const discount = itemTotal >= 20000 ? 2000 : 0
  const totalPrice = itemTotal + deliveryFee - discount

  const pickupMethod = b.pickupMethod === 'pickup' ? 'pickup' : 'delivery'
  const addr = (b.address && typeof b.address === 'object') ? b.address : {}
  const pickupName = String(b.pickupName || '').trim() || String(addr.name || '').trim()
  const pickupPhone = String(b.pickupPhone || '').trim() || String(addr.phone || '').trim()
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

export default router
