// 跳舞兰AI花店 H5 — Node 后端（MySQL 只读库代理）
// 仅服务端运行，持有 DB 账号；前端经 Vite /api 代理同源调用，账号永不到达浏览器。
import express from 'express'
import cors from 'cors'
import { query, getColumns } from './db.js'
import { mapFlowerRow, mapShopRow, prepareShopTrustInfo, mapReviewRow, mapUserRow } from './mapping.js'

const app = express()
app.use(cors())
app.use(express.json())

// 表名映射：真实表名不同就在 .env 里改（TBL_FLOWERS 等）
const T = {
  flowers: process.env.TBL_FLOWERS || 'flowers',
  shops: process.env.TBL_SHOPS || 'shops',
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

app.get('/api/health', async (req, res) => {
  let dbConnected = false
  let dbError = null
  try {
    await query('SELECT 1')
    dbConnected = true
  } catch (e) {
    dbError = String((e && e.message) || e)
  }
  res.json({ ok: true, dbConnected, dbError, tables: T, priceUnit: process.env.DB_PRICE_UNIT || 'yuan' })
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
  try {
    const rows = await query(`SELECT * FROM \`${T.flowers}\` WHERE id = ?`, [req.params.id])
    if (!rows.length) return res.json({ error: 'not found' })
    const f = mapFlowerRow(rows[0])
    const price = f.price || 0
    const originalPrice = f.originalPrice || 0
    const hasDiscount = originalPrice > price
    const discountRate = hasDiscount ? (Math.round((price / originalPrice) * 100) / 10).toFixed(1) : '0'
    res.json({
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
    })
  } catch (e) {
    fail(res, e)
  }
})

app.get('/api/shops/:id', async (req, res) => {
  try {
    const rows = await query(`SELECT * FROM \`${T.shops}\` WHERE id = ?`, [req.params.id])
    if (!rows.length) return res.json({ error: 'not found' })
    const shop = prepareShopTrustInfo(mapShopRow(rows[0]))
    const ids = shop.flowers || []
    let allFlowers = []
    if (ids.length) {
      const ph = ids.map(() => '?').join(',')
      const fRows = await query(`SELECT * FROM \`${T.flowers}\` WHERE id IN (${ph})`, ids)
      allFlowers = fRows.map(r => mapFlowerRow(r))
    }
    if (!allFlowers.length && shop.categoryId) {
      const fRows = await query(`SELECT * FROM \`${T.flowers}\` WHERE category_id = ? LIMIT 12`, [shop.categoryId])
      allFlowers = fRows.map(r => mapFlowerRow(r))
    }
    const flowers = allFlowers
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
  try {
    const q = (req.query.q || '').trim()
    if (!q) return res.json({ flowers: [], shops: [] })
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

const PORT = Number(process.env.API_PORT || 4000)
app.listen(PORT, () => {
  console.log(`[server] 跳舞兰 H5 后端已启动: http://localhost:${PORT}  (DB host=${process.env.DB_HOST || '118.25.21.45'} db=${process.env.DB_NAME || 'flower_shop'})`)
})
