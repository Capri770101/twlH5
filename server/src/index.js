// 跳舞兰AI花店 H5 — Node 后端（MySQL 只读库代理）
// 仅服务端运行，持有 DB 账号；前端经 Vite /api 代理同源调用，账号永不到达浏览器。
import express from 'express'
import cors from 'cors'
import { query, getColumns } from './db.js'
import { h5DbHealth } from './h5db.js'
import { mapFlowerRow, mapShopRow, prepareShopTrustInfo, mapReviewRow, mapUserRow } from './mapping.js'
import {
  toFlower, toShop, isOnSale,
  storeHome, storeCategories, storeAllFlowers, storeFlowerById, storeAllShops, storeShopFull, storeHealth
} from './store.js'
import payRouter, { handleNotify } from './pay.js'
import ordersRouter from './orders.js'
import authRouter from './auth.js'

const app = express()
app.use(cors())
// 微信支付回调需「原始 body」验签：/api/pay/notify 必须跳过 JSON 解析，交给下游 express.raw，
// 否则 express.json 先消费请求流 → raw 恒空 → 验签必失败（回调永远进不来）。
const jsonParser = express.json()
app.use((req, res, next) => (req.path === '/api/pay/notify' ? next() : jsonParser(req, res, next)))

// 读数据源：api=同事业务 API（默认，推荐）/ mysql=直连 flower_shop（旧方案，白名单已不会开）
const READ_SOURCE = (process.env.READ_SOURCE || 'api').toLowerCase() === 'mysql' ? 'mysql' : 'api'

// 表名映射：真实表名不同就在 .env 里改（TBL_FLOWERS 等）
const T = {
  flowers: process.env.TBL_FLOWERS || 'flowers',
  shops: process.env.TBL_SHOPS || 'shops',
  shopProducts: process.env.TBL_SHOP_PRODUCTS || 'shop_products',
  categories: process.env.TBL_CATEGORIES || 'categories',
  reviews: process.env.TBL_REVIEWS || 'reviews',
  orders: process.env.TBL_ORDERS || 'orders',
  users: process.env.TBL_USERS || 'users'
}

// 首页 Banner / 分类静态兜底（营销位不一定在库里）
const DEFAULT_BANNERS = [
  { id: 'b1', title: '跳舞兰AI花店', subtitle: '家门口的实体花店，新鲜现包当日送', desc: '拒绝网图假货，全部门店实拍出品', color: '#E8615D', link: '' },
  { id: 'b2', title: '品质花店', subtitle: '精选附近实体花店，鲜花现包当日送', color: '#4ECDC4', link: '' },
  { id: 'b3', title: '新店入驻', subtitle: '花店免费入驻，AI赋能', color: '#748FFC', link: '' }
]
const DEFAULT_CATEGORIES = [
  { id: '1', name: '店铺热销', icon: '🔥', color: '#FF6B6B' },
  { id: '2', name: '生日鲜花', icon: '🎂', color: '#FFA94D' },
  { id: '3', name: '向日葵花', icon: '🌻', color: '#748FFC' },
  { id: '4', name: '高端花礼', icon: '💐', color: '#51CF66' },
  { id: '5', name: '时尚新款', icon: '✨', color: '#DA77F2' },
  { id: '6', name: '男士花束', icon: '💼', color: '#4ECDC4' },
  { id: '7', name: '求婚告白', icon: '💍', color: '#FFD43B' },
  { id: '8', name: '长辈专区', icon: '🌷', color: '#B197FC' },
  { id: '9', name: '开业花篮', icon: '🎉', color: '#20C997' },
  { id: '10', name: '家居鲜花', icon: '🏠', color: '#82C91E' },
  { id: '11', name: '鲜花配件', icon: '🎁', color: '#F06595' }
]

// 统一错误返回：前端 realApi 见到 {error} 会抛错并回退 mock
function fail(res, e) {
  console.error('[api] 查询失败：', e && e.message ? e.message : e)
  res.json({ error: String((e && e.message) || e) })
}

// 商品详情衍生字段（DB / API 两数据源共用，与前端 getFlowerDetail 形状对齐）
function enrichDetail(f) {
  const price = f.price || 0
  const originalPrice = f.originalPrice || 0
  const hasDiscount = originalPrice > price
  const discountRate = hasDiscount ? (Math.round((price / originalPrice) * 100) / 10).toFixed(1) : '0'
  return {
    ...f,
    hasDiscount,
    discountRate,
    displayTags: f.tags || [],
    materialItems: f.flowers || [],
    sceneItems: f.tags || [],
    meaningText: f.flowerMeaning || '',
    descriptionText: f.description || '',
    serviceItems: ['坏单包退', '缺枝补发', '准时送达', '花材新鲜'],
    deliveryText: '同城配送'
  }
}

// 商品排序（API 源本地执行；价格=分）
function sortFlowers(list, sort) {
  const arr = [...list]
  if (sort === 'price_asc') arr.sort((a, b) => a.price - b.price)
  else if (sort === 'price_desc') arr.sort((a, b) => b.price - a.price)
  else if (sort === 'sales') arr.sort((a, b) => (b.sales || 0) - (a.sales || 0))
  else arr.sort((a, b) => (b.sales || 0) - (a.sales || 0))
  return arr
}

// 店内商品多策略拉取（真实库 flower_shop 只有 products/shops/shop_products，关联在 shop_products）
// 依次尝试：① shop_products JOIN products（真实库） → ② products.owner_shop_id → ③ shops.flowers 老模型 id 列表
async function queryShopFlowers(shopId, shopFlowerIds = []) {
  // ① 真实库：shop_products(shop_id, product_id, sort_order) JOIN products
  try {
    const rows = await query(
      `SELECT p.* FROM \`${T.shopProducts}\` sp
       JOIN \`${T.flowers}\` p ON p.id = sp.product_id
       WHERE sp.shop_id = ?
       ORDER BY sp.sort_order ASC, sp.id ASC
       LIMIT 200`,
      [shopId]
    )
    if (rows.length) return rows
  } catch (e) {
    console.warn('[api] shop_products JOIN 不可用（退化），', e.message)
  }
  // ② products.owner_shop_id 直接归属
  try {
    const rows = await query(`SELECT * FROM \`${T.flowers}\` WHERE owner_shop_id = ? LIMIT 200`, [shopId])
    if (rows.length) return rows
  } catch (e) {
    console.warn('[api] owner_shop_id 查询不可用（退化），', e.message)
  }
  // ③ 老模型：shops.flowers 列里的 id 列表
  const ids = (shopFlowerIds || []).filter(Boolean)
  if (ids.length) {
    try {
      const ph = ids.map(() => '?').join(',')
      const rows = await query(`SELECT * FROM \`${T.flowers}\` WHERE id IN (${ph})`, ids)
      if (rows.length) return rows
    } catch (e) {
      console.warn('[api] shops.flowers 老模型查询不可用，', e.message)
    }
  }
  return []
}

app.get('/api/health', async (req, res) => {
  // READ_SOURCE=api 时商品来自 aistore 业务 API，flower_shop 只读库根本不参与 →
  // 不再去连它（否则会永远报一条误导性的 dbConnected:false）
  const needFlowerDb = READ_SOURCE !== 'api'
  const [db, h5, storeR] = await Promise.allSettled([
    needFlowerDb ? query('SELECT 1').then(() => true) : Promise.resolve(null),
    h5DbHealth().then(() => true),
    storeHealth().then(() => true)
  ])
  const dbConnected = needFlowerDb ? db.status === 'fulfilled' : null
  const h5Connected = h5.status === 'fulfilled'
  const storeOk = storeR.status === 'fulfilled'
  res.json({
    ok: h5Connected && storeOk,               // 真正决定 H5 可否使用的两项
    readSource: READ_SOURCE,
    dbConnected,                              // null = 当前读源不需要该库
    dbError: !needFlowerDb ? null
      : (db.status === 'fulfilled' ? null : String(db.reason && db.reason.message || db.reason)),
    h5Connected,                              // h5_shop 业务库（订单/用户/支付）
    h5Error: h5Connected ? null : String(h5.reason && h5.reason.message || h5.reason),
    storeOk,                                  // 商品数据源（aistore API）
    storeError: storeOk ? null : String(storeR.reason && storeR.reason.message || storeR.reason),
    tables: T, priceUnit: process.env.DB_PRICE_UNIT || 'cents'
  })
})

// schema 发现：在白名单 IP 的机器上运行后，把结果贴给前端即可精确对齐列
app.get('/api/meta/tables', async (req, res) => {
  try {
    const rows = await query('SHOW TABLES')
    const key = Object.keys(rows[0] || {})[0]
    res.json({ tables: rows.map(r => r[key]) })
  } catch (e) {
    fail(res, e)
  }
})

app.get('/api/meta/columns', async (req, res) => {
  const t = req.query.table
  if (!t) return res.json({ error: 'missing table' })
  try {
    res.json({ table: t, columns: await getColumns(t) })
  } catch (e) {
    fail(res, e)
  }
})

app.get('/api/categories', async (req, res) => {
  if (READ_SOURCE === 'api') {
    try {
      const rows = await storeCategories()
      res.json(rows.length ? rows : DEFAULT_CATEGORIES)
    } catch (e) {
      fail(res, e)
    }
    return
  }
  try {
    let rows = []
    try {
      rows = await query(`SELECT * FROM \`${T.categories}\` ORDER BY id`)
    } catch (e) {
      rows = DEFAULT_CATEGORIES
    }
    if (!rows.length) rows = DEFAULT_CATEGORIES
    res.json(rows)
  } catch (e) {
    fail(res, e)
  }
})

app.get('/api/home', async (req, res) => {
  if (READ_SOURCE === 'api') {
    try {
      const h = await storeHome()
      const banners = (h.banners || []).map((b, i) => ({
        id: String(b.id || 'b' + (i + 1)),
        title: String(b.title || ''),
        subtitle: String(b.subtitle || ''),
        desc: String(b.desc || ''),
        link: String(b.link || ''),
        color: String(b.color || '#E8615D'),
        image: String(b.image || ''),
        shopId: String(b.shopId || '')
      }))
      const categories = (h.categories || []).length ? h.categories : DEFAULT_CATEGORIES
      const recommendFlowers = (h.recommendFlowers || []).filter(isOnSale).map((p, i) => toFlower(p, { index: i }))
      const nearbyShops = (h.nearbyShops || []).map(s => toShop(s))
      res.json({ banners, categories, recommendFlowers, nearbyShops })
    } catch (e) {
      fail(res, e)
    }
    return
  }
  try {
    const fRows = await query(`SELECT * FROM \`${T.flowers}\` ORDER BY sales DESC LIMIT 6`)
    const sRows = await query(`SELECT * FROM \`${T.shops}\` LIMIT 4`)
    let cats = []
    try {
      cats = await query(`SELECT * FROM \`${T.categories}\` ORDER BY id`)
    } catch (e) {
      cats = DEFAULT_CATEGORIES
    }
    const recommendFlowers = fRows.map((r, i) => mapFlowerRow(r, { index: i }))
    const nearbyShops = sRows.map(s => {
      const m = mapShopRow(s)
      return { ...m, distanceKm: parseFloat(m.distance) || null }
    })
    res.json({
      banners: DEFAULT_BANNERS,
      categories: cats.length ? cats : DEFAULT_CATEGORIES,
      recommendFlowers,
      nearbyShops
    })
  } catch (e) {
    fail(res, e)
  }
})

app.get('/api/flowers', async (req, res) => {
  if (READ_SOURCE === 'api') {
    try {
      const { categoryId = '', sort = 'default', page = '1', pageSize = '10' } = req.query
      const all = (await storeAllFlowers()).filter(isOnSale)
      const arr = categoryId ? all.filter(p => String(p.categoryId || '') === String(categoryId)) : all
      const total = arr.length
      const p = Math.max(1, parseInt(page) || 1)
      const ps = Math.max(1, parseInt(pageSize) || 10)
      const rows = sortFlowers(arr, sort).slice((p - 1) * ps, (p - 1) * ps + ps)
      res.json({ list: rows.map(r => toFlower(r)), total, hasMore: (p - 1) * ps + rows.length < total })
    } catch (e) {
      fail(res, e)
    }
    return
  }
  try {
    const { categoryId = '', sort = 'default', page = '1', pageSize = '10' } = req.query
    const where = []
    const params = []
    if (categoryId) {
      where.push('category_id = ?')
      params.push(categoryId)
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
    let orderBy = 'sales DESC'
    if (sort === 'price_asc') orderBy = 'price ASC'
    else if (sort === 'price_desc') orderBy = 'price DESC'
    else if (sort === 'sales') orderBy = 'sales DESC'
    const p = Math.max(1, parseInt(page) || 1)
    const ps = Math.max(1, parseInt(pageSize) || 10)
    const totalRows = await query(`SELECT COUNT(*) c FROM \`${T.flowers}\` ${w}`, params)
    const total = totalRows[0] && totalRows[0].c ? Number(totalRows[0].c) : 0
    const rows = await query(
      `SELECT * FROM \`${T.flowers}\` ${w} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, ps, (p - 1) * ps]
    )
    res.json({ list: rows.map(r => mapFlowerRow(r)), total, hasMore: (p - 1) * ps + rows.length < total })
  } catch (e) {
    fail(res, e)
  }
})

app.get('/api/flowers/:id', async (req, res) => {
  if (READ_SOURCE === 'api') {
    try {
      const flower = await storeFlowerById(req.params.id)
      res.json(enrichDetail(toFlower(flower)))
    } catch (e) {
      fail(res, e)
    }
    return
  }
  try {
    const rows = await query(`SELECT * FROM \`${T.flowers}\` WHERE id = ?`, [req.params.id])
    if (!rows.length) return res.json({ error: 'not found' })
    res.json(enrichDetail(mapFlowerRow(rows[0])))
  } catch (e) {
    fail(res, e)
  }
})

// 门店列表（首页「更多花店」；仅 API 源提供，DB 源无独立列表路由时同返空）
app.get('/api/shops', async (req, res) => {
  if (READ_SOURCE === 'api') {
    try {
      const list = (await storeAllShops()).map(s => toShop(s))
      res.json(list)
    } catch (e) {
      fail(res, e)
    }
    return
  }
  try {
    const sRows = await query(`SELECT * FROM \`${T.shops}\` LIMIT 100`)
    res.json(sRows.map(s => mapShopRow(s)))
  } catch (e) {
    fail(res, e)
  }
})

app.get('/api/shops/:id', async (req, res) => {
  if (READ_SOURCE === 'api') {
    try {
      const d = await storeShopFull(req.params.id)
      const shop = prepareShopTrustInfo(toShop(d.shop))
      // 店内目录按 shop.flowers 展示序排；仅展示上架，全下架时兜底全量防空页
      const orderMap = new Map((d.shop.flowers || []).map((fid, i) => [String(fid), i]))
      const rank = (a, b) => (orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 1e9) - (orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 1e9)
      let flowers = (d.products || []).filter(isOnSale).sort(rank).map(p => toFlower(p))
      if (!flowers.length) flowers = (d.products || []).map(p => toFlower(p))
      const featured = flowers.slice(0, 3)
      const catName = new Map((d.categories || []).map(c => [String(c.id), String(c.name || c.id)]))
      const catMap = new Map()
      flowers.forEach(f => {
        const cid = String(f.categoryId || 'other')
        if (!catMap.has(cid)) catMap.set(cid, { id: cid, name: catName.get(cid) || cid })
      })
      const categories = [{ id: '', name: '全部' }, ...Array.from(catMap.values())]
      res.json({ shop, flowers, featured, categories })
    } catch (e) {
      fail(res, e)
    }
    return
  }
  try {
    const rows = await query(`SELECT * FROM \`${T.shops}\` WHERE id = ?`, [req.params.id])
    if (!rows.length) return res.json({ error: 'not found' })
    const rawShop = mapShopRow(rows[0])
    const shop = prepareShopTrustInfo(rawShop)
    // 店内商品：真实库走 shop_products JOIN products，自动退化兼容老模型
    let flowers = (await queryShopFlowers(shop.id, rawShop.flowers)).map(r => mapFlowerRow(r))
    if (!flowers.length && shop.categoryId) {
      const fRows = await query(`SELECT * FROM \`${T.flowers}\` WHERE category_id = ? LIMIT 12`, [shop.categoryId])
      flowers = fRows.map(r => mapFlowerRow(r))
    }
    const featured = flowers.slice(0, 3)
    const catMap = new Map()
    flowers.forEach(f => {
      const cid = f.categoryId || 'other'
      if (!catMap.has(cid)) catMap.set(cid, { id: cid, name: cid })
    })
    const categories = [{ id: '', name: '全部' }, ...Array.from(catMap.values())]
    res.json({ shop, flowers, featured, categories })
  } catch (e) {
    fail(res, e)
  }
})

app.get('/api/shops/:id/reviews', async (req, res) => {
  // API 源暂无评价端点：快速返回空（前端按空态处理），不等待 MySQL 超时
  if (READ_SOURCE === 'api') return res.json([])
  try {
    let rows = []
    try {
      rows = await query(`SELECT * FROM \`${T.reviews}\` WHERE shop_id = ? ORDER BY id DESC LIMIT 20`, [req.params.id])
    } catch (e) {
      rows = []
    }
    res.json(rows.map(mapReviewRow))
  } catch (e) {
    fail(res, e)
  }
})

// 用户表只读查询（模板表，生产环境未必存在；失败回退 {error} 由前端按回退逻辑处理）
app.get('/api/users', async (req, res) => {
  try {
    const { page = '1', pageSize = '20', keyword = '' } = req.query
    const where = []
    const params = []
    if (keyword) {
      where.push('(nickname LIKE ? OR phone LIKE ?)')
      const like = `%${keyword}%`
      params.push(like, like)
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const p = Math.max(1, parseInt(page) || 1)
    const ps = Math.max(1, parseInt(pageSize) || 20)
    const rows = await query(
      `SELECT * FROM \`${T.users}\` ${w} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, ps, (p - 1) * ps]
    )
    res.json({ list: rows.map(r => mapUserRow(r)), total: rows.length })
  } catch (e) {
    fail(res, e)
  }
})

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json({ flowers: [], shops: [] })
  if (READ_SOURCE === 'api') {
    try {
      const kw = q.toLowerCase()
      const hit = (s) => s && String(s).toLowerCase().includes(kw)
      const fAll = (await storeAllFlowers()).filter(isOnSale)
      const fRows = fAll.filter(p =>
        hit(p.name) || hit(p.subtitle) || hit(p.shopName) ||
        (Array.isArray(p.tags) && p.tags.some(hit)) ||
        (Array.isArray(p.flowers) && p.flowers.some(hit))
      ).slice(0, 20)
      const sAll = await storeAllShops()
      const sRows = sAll.filter(s => hit(s.name) || hit(s.address) || hit(s.ipText)).slice(0, 20)
      res.json({ flowers: fRows.map(r => toFlower(r)), shops: sRows.map(s => toShop(s)) })
    } catch (e) {
      fail(res, e)
    }
    return
  }
  try {
    const like = `%${q}%`
    const fRows = await query(
      `SELECT * FROM \`${T.flowers}\` WHERE name LIKE ? OR subtitle LIKE ? OR tags LIKE ? LIMIT 20`,
      [like, like, like]
    )
    const sRows = await query(
      `SELECT * FROM \`${T.shops}\` WHERE name LIKE ? OR address LIKE ? LIMIT 20`,
      [like, like]
    )
    res.json({ flowers: fRows.map(r => mapFlowerRow(r)), shops: sRows.map(r => mapShopRow(r)) })
  } catch (e) {
    fail(res, e)
  }
})

// ---------- 微信支付（服务商 + 分账） ----------
app.use('/api/pay', payRouter)
// 回调需原始 body 验签
app.post('/api/pay/notify', express.raw({ type: 'application/json' }), async (req, res) => {
  const raw = req.body && Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''
  const result = await handleNotify(raw, req.headers)
  res.status(result.status).json(result.json)
})

// ---------- H5 业务：订单读写 + 用户身份（h5_shop 库） ----------
app.use('/api/orders', ordersRouter)
app.use('/api/auth', authRouter)

const PORT = Number(process.env.API_PORT || 4000)
app.listen(PORT, () => {
  const store = process.env.READ_SOURCE || 'api'
  const biz = `业务库 ${process.env.H5_DB_USER || 'h5_app'}@${process.env.H5_DB_HOST || '127.0.0.1'}:${process.env.H5_DB_PORT || 3306}/${process.env.H5_DB_NAME || 'h5_shop'}`
  const src = store === 'api'
    ? `商品源 ${process.env.STORE_API_BASE || 'https://aistore.xiangbinmeigui.com'}`
    : `商品源 DB ${process.env.DB_USER || 'ai_readonly'}@${process.env.DB_HOST || '127.0.0.1'}/${process.env.DB_NAME || 'flower_shop'}`
  console.log(`[server] 跳舞兰 H5 后端已启动: http://localhost:${PORT}`)
  console.log(`[server]   ${biz}`)
  console.log(`[server]   ${src}（READ_SOURCE=${store}）`)
})
