/**
 * 下单前城市校验 —— 「用户钱已付、商家却收不到单」的最后一道闸。
 *
 * 为什么必须有：商家后端 `orders/create` 会硬校验「收货城市 == 门店服务城市」，
 * 不匹配直接拒单（文案「该商品由 XX 门店配送…请返回首页切换至 YY 市」）。
 * 如果没有这道前置校验，用户会付款成功、商家收不到单 —— 比不接通更糟。
 *
 * 设计原则：**宁可不拦**。门店城市取不到（上游抖动/商品异常）时放行，
 * 交给商家侧最终校验兜底；只在「两边城市都拿到了且互不相同」时才拒绝。
 */
import { parseRegion } from './merchantBridge.js'
import { storeShopFull, toShop } from './store.js'

/** 城市名宽松比较：「福州」≈「福州市」（与商家 API 的匹配方式一致） */
const normCity = s => String(s || '').trim().replace(/市$/, '')

/** 从下单地址对象里取城市名（兼容 city / region / province+district 三种写法） */
export function addressCity(addr) {
  const a = addr && typeof addr === 'object' ? addr : {}
  const direct = String(a.city || '').trim()
  if (direct) return direct
  const raw =
    String(a.region || '').trim().replace(/\s+/g, '') ||
    [a.province, a.city, a.district].filter(Boolean).join('')
  if (!raw) return ''
  const { city } = parseRegion(raw)
  // ⚠️ parseRegion 在「完全匹配不到城市」时会兜底返回原串（如「福建省鼓楼区」）。
  //    那种值是地址残片、不是城市名，若拿去比较会把正常订单误判成跨城 → 视为「城市未知」放行。
  return city && city !== raw ? city : ''
}

/** 取门店所在城市（走 aistore 商品源，带 TTL 缓存） */
export async function shopCity(shopId) {
  const d = await storeShopFull(shopId)
  return String((toShop(d && d.shop) || {}).city || '').trim()
}

/**
 * 校验「收货城市 == 门店城市」。
 * @returns {Promise<{ok:boolean, shopCity?:string, addrCity?:string, message?:string}>}
 */
export async function checkCityMatch(shopId, addr) {
  const addrCityName = addressCity(addr)
  let shopCityName = ''
  try {
    shopCityName = await shopCity(shopId)
  } catch (e) {
    console.warn('[cityGuard] 门店城市取不到，放行交由商家侧校验：', e && e.message)
    return { ok: true, shopCity: '', addrCity: addrCityName }
  }
  if (!shopCityName || !addrCityName) return { ok: true, shopCity: shopCityName, addrCity: addrCityName }
  if (normCity(shopCityName) === normCity(addrCityName)) {
    return { ok: true, shopCity: shopCityName, addrCity: addrCityName }
  }
  return {
    ok: false,
    shopCity: shopCityName,
    addrCity: addrCityName,
    message:
      `该商品由「${shopCityName}」的门店配送，当前收货地址在「${addrCityName}」，暂不支持跨城市配送。` +
      `请把城市切换到「${shopCityName}」重新选择商品，或改用「${shopCityName}」的收货地址。`
  }
}
