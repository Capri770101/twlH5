// aistore 业务 API 适配层（同事现有业务 API，只读）
// 用法：读接口数据源 READ_SOURCE=api（默认）时，index.js 经本模块取数，
//       复用 mapping.js 的 mapFlowerRow/mapShopRow（aistore camelCase 字段已被 pick() 覆盖，价格=分）。
// 特性：内存 TTL 缓存（防打爆同事接口）、Node fetch + 超时、code!=0 / HTTP 错误抛异常（由 index.js fail() 统一回退前端 mock）。
import { mapFlowerRow, mapShopRow, normalizeAssetUrls } from './mapping.js'

const BASE = (process.env.STORE_API_BASE || 'https://aistore.xiangbinmeigui.com').replace(/\/+$/, '')
const TIMEOUT = Number(process.env.STORE_TIMEOUT || 8000)
const TTL = { home: 30000, flowers: 60000, shops: 60000, shop: 60000 } // ms

// 简单 TTL 缓存（存 Promise，防并发击穿；失败自动剔除下次重试）
const cache = new Map()
async function withCache(key, ttl, loader) {
  const hit = cache.get(key)
  if (hit && Date.now() < hit.exp) return hit.data
  const p = loader().catch(e => { cache.delete(key); throw e })
  cache.set(key, { exp: Date.now() + ttl, data: p })
  return p
}

/** GET 业务 API；code!==0 / data===null 视为业务失败抛错 */
async function storeFetch(path, params) {
  const url = new URL(BASE + path)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== '' && v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
  }
  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) })
  } catch (e) {
    throw new Error('store ' + path + ' 网络错误: ' + (e && e.message ? e.message : e))
  }
  if (!res.ok) throw new Error('store ' + path + ' HTTP ' + res.status)
  const j = await res.json()
  if (!j || j.code !== 0) throw new Error('store ' + path + ' code=' + (j && j.code) + ' msg=' + (j && j.message))
  if (j.data === null || j.data === undefined) throw new Error('store ' + path + ' not found')
  // 源站按请求 Host 生成图片绝对地址；经本机直连会得到 127.0.0.1 → 统一改写为公网域名
  return normalizeAssetUrls(j.data)
}

/** 商品上架判定：aistore 的 status 稀疏（部分商品无此键），仅显式 off 视为下架 */
export function isOnSale(p) {
  return !!(p && p.status !== 'off')
}

/** 商品对象 → 前端花束形状（mapFlowerRow；价格按分直通） */
export function toFlower(prod, opts) {
  return mapFlowerRow(prod || {}, opts)
}

/** 店铺对象 → 前端店铺形状（mapShopRow + 保留 aistore 特有字段） */
export function toShop(raw) {
  const s = mapShopRow(raw || {})
  if (!raw) return s
  // 保留对前端有用的扩展字段
  s.city = String(raw.city || '')
  s.status = String(raw.status || '')
  // 🔴 **绝不透出** `subMchId` / `profitSharingRatio`：
  //    前者是微信子商户号，后者是平台与花店的分账比例（商业机密）。
  //    前端完全用不到——子商户号由服务端 `submch.js` 直接查库解析，不依赖本对象。
  //    2026-09-18 外部审计 P0-1：/api/shops 匿名即可取到 12 家的子商户号与分账比例。
  s.latitude = raw.latitude != null ? Number(raw.latitude) : undefined
  s.longitude = raw.longitude != null ? Number(raw.longitude) : undefined
  s.ipTitle = String(raw.ipTitle || '')
  s.ipText = String(raw.ipText || '')
  s.distanceKm = raw.distance ? (parseFloat(String(raw.distance)) || null) : null
  return s
}

/** 城市参数规范化（去空格；aistore 对带不带「市」都能匹配，如「福州」与「福州市」等价） */
function normCity(city) {
  return String(city || '').trim()
}

/** 首页聚合数据（home/index 与我方 /api/home 契约同构）；传 city 只取该城内容 */
export function storeHome(city = '') {
  const c = normCity(city)
  return withCache('home:' + c, TTL.home, () => storeFetch('/v1/home/index', c ? { city: c } : undefined))
}

/** 分类（取自首页 categories；为空回退默认 12 类）。分类是全局的，不随城市变化 */
export async function storeCategories() {
  const h = await storeHome()
  return (h.categories || []).length ? h.categories : []
}

/** 全量商品；传 city 只取该城门店的商品。status 稀疏：只过滤显式 off 由调用方做 */
export function storeAllFlowers(city = '') {
  const c = normCity(city)
  return withCache('flowers:' + c, TTL.flowers, async () => {
    const d = await storeFetch('/v1/flowers/list', c ? { city: c } : undefined)
    return d.list || []
  })
}

/** 单商品详情；不存在抛 'not found' 类错误 */
export function storeFlowerById(id) {
  return storeFetch('/v1/flowers/detail', { id })
}

/** 全量店铺列表；传 city 只取该城门店 */
export function storeAllShops(city = '') {
  const c = normCity(city)
  return withCache('shops:' + c, TTL.shops, async () => {
    const d = await storeFetch('/v1/shops/list', c ? { city: c } : undefined)
    return d.list || []
  })
}

/**
 * 已开通城市列表（供前端城市选择器）。
 * 由全量门店去重得出（复用 storeAllShops('') 的缓存，不额外打一次上游）。
 * 返回按门店数降序：[{ name:'福州', shops:2 }, ...]
 */
export async function storeCities() {
  const rows = await storeAllShops('')
  const m = new Map()
  for (const s of rows) {
    const c = normCity(s && s.city)
    if (!c) continue
    m.set(c, (m.get(c) || 0) + 1)
  }
  return Array.from(m, ([name, shops]) => ({ name, shops })).sort(
    (a, b) => b.shops - a.shops || String(a.name).localeCompare(String(b.name))
  )
}

/** 店铺详情 + 店内目录（includeCatalog=1；不存在抛错） */
export function storeShopFull(id) {
  return withCache('shop:' + id, TTL.shop, async () => {
    const d = await storeFetch('/v1/shops/detail', { id, includeCatalog: 1 })
    if (!d || !d.shop) throw new Error('store shop not found: ' + id)
    return d // { shop, products[], categories[] }
  })
}

/** 健康探测：拉一次首页看业务 API 是否可达 */
export async function storeHealth() {
  await storeHome()
  return true
}
