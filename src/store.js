import { reactive, computed } from 'vue'

// 对应小程序 app.js 的 globalData
const state = reactive({
  userInfo: null,
  token: '',
  isLogged: false,
  cart: [],
  shopId: 'default',
  // 收货地址列表（对应小程序 user_address_list）
  addresses: [],
  selectedAddress: null,
  // 商品收藏（纯本地，localStorage 持久化）
  favorites: [],
  // 优惠券（本地领取，localStorage 持久化；正式核销待后端券接口）
  coupons: []
})

const CART_KEY = 'twd_cart'
const ADDRS_KEY = 'twd_addresses'
const SEL_KEY = 'twd_selected_address'
const TOKEN_KEY = 'twd_token'
const USER_KEY = 'twd_userInfo'

// 恢复本地数据
try {
  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
  if (cart.length) state.cart = cart
  const addrs = JSON.parse(localStorage.getItem(ADDRS_KEY) || '[]')
  if (Array.isArray(addrs) && addrs.length) state.addresses = addrs
  const sel = JSON.parse(localStorage.getItem(SEL_KEY) || 'null')
  if (sel) state.selectedAddress = sel
  // 登录态恢复（与小程序 app.js onLaunch 读 token/userInfo 一致）
  const token = localStorage.getItem(TOKEN_KEY)
  const userInfo = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  if (token && userInfo) {
    state.token = token
    state.userInfo = userInfo
    state.isLogged = true
  }
} catch (e) {
  /* 忽略损坏的本地数据 */
}

function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart))
}

function persistAddr() {
  localStorage.setItem(ADDRS_KEY, JSON.stringify(state.addresses))
  localStorage.setItem(SEL_KEY, JSON.stringify(state.selectedAddress))
}

export const cartCount = computed(() =>
  state.cart.reduce((sum, item) => sum + item.quantity, 0)
)

export const totalPrice = computed(() =>
  state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
)

/** 按店铺分组，对应 cart.wxml 的 groupedCart */
export const groupedCart = computed(() => {
  const map = new Map()
  state.cart.forEach(item => {
    const key = item.shopId || 'default'
    if (!map.has(key)) {
      map.set(key, { shopId: key, shopName: item.shopName || '跳舞兰AI花店', items: [] })
    }
    map.get(key).items.push(item)
  })
  return Array.from(map.values())
})

export function addToCart(product, quantity = 1) {
  const cart = state.cart
  const pShopId = product.shopId || state.shopId || ''
  const exist = cart.find(item => item.id === product.id && item.shopId === pShopId)
  if (exist) {
    exist.quantity += quantity
    if (product.shopName) exist.shopName = product.shopName
  } else {
    cart.push({
      id: product.id,
      name: product.name || '',
      subtitle: product.subtitle || '',
      image: (product.images && product.images[0]) || product.image || '',
      price: product.price || 0,
      originalPrice: product.originalPrice || 0,
      stock: product.stock ?? null,
      quantity,
      shopId: pShopId,
      shopName: product.shopName || ''
    })
  }
  persistCart()
}

export function changeQuantity(id, shopId, delta) {
  const item = state.cart.find(i => i.id === id && i.shopId === (shopId || 'default'))
  if (!item) return
  item.quantity += delta
  if (item.quantity < 1) item.quantity = 1
  persistCart()
}

export function removeFromCart(id, shopId) {
  const idx = state.cart.findIndex(i => i.id === id && i.shopId === (shopId || 'default'))
  if (idx >= 0) state.cart.splice(idx, 1)
  persistCart()
}

export function clearCart() {
  state.cart.splice(0, state.cart.length)
  persistCart()
}

/* ============ 收货地址管理 ============ */

export function addAddress(addr) {
  const list = state.addresses
  if (addr.isDefault || list.length === 0) {
    addr.isDefault = true
    list.forEach(a => {
      if (a.id !== addr.id) a.isDefault = false
    })
  }
  const idx = list.findIndex(a => a.id === addr.id)
  if (idx >= 0) list[idx] = addr
  else list.push(addr)
  if (addr.isDefault) state.selectedAddress = addr
  persistAddr()
}

export const updateAddress = addr => addAddress(addr)

export function removeAddress(id) {
  const idx = state.addresses.findIndex(a => a.id === id)
  if (idx < 0) return
  const wasDefault = state.addresses[idx].isDefault
  state.addresses.splice(idx, 1)
  if (wasDefault && state.addresses.length) state.addresses[0].isDefault = true
  if (state.selectedAddress && state.selectedAddress.id === id) {
    state.selectedAddress = state.addresses.find(a => a.isDefault) || state.addresses[0] || null
  }
  persistAddr()
}

export function setDefaultAddress(id) {
  state.addresses.forEach(a => (a.isDefault = a.id === id))
  const hit = state.addresses.find(a => a.id === id)
  if (hit) state.selectedAddress = hit
  persistAddr()
}

export function selectAddress(addr) {
  state.selectedAddress = addr
  persistAddr()
}

/** 分 → 元，整数不带小数（与小程序 WXML 里 price/100 的显示一致） */
export const money = fen => {
  const v = (fen || 0) / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/* ============ 登录态管理 ============ */

export function login(userInfo, token) {
  state.userInfo = userInfo
  state.token = token
  state.isLogged = true
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(userInfo))
}

export function logout() {
  state.userInfo = null
  state.token = ''
  state.isLogged = false
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/** 合并更新当前用户资料并持久化（账户设置页调用） */
export function updateUserInfo(partial) {
  if (!state.userInfo) {
    if (!state.token) return
    state.userInfo = {}
  }
  state.userInfo = { ...state.userInfo, ...(partial || {}) }
  state.isLogged = true
  localStorage.setItem(USER_KEY, JSON.stringify(state.userInfo))
}

/* ============ 商品收藏（本地持久化） ============ */

const FAV_KEY = 'twd_favorites'
try {
  const favs = JSON.parse(localStorage.getItem(FAV_KEY) || '[]')
  if (Array.isArray(favs) && favs.length) state.favorites = favs
} catch (e) {}

const COUPON_KEY = 'twd_coupons'
try {
  const cps = JSON.parse(localStorage.getItem(COUPON_KEY) || '[]')
  if (Array.isArray(cps) && cps.length) state.coupons = cps
} catch (e) {}

function persistFavorites() {
  localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites))
}

export const favoriteIds = computed(() => new Set(state.favorites.map(f => f.id)))
export const favoriteCount = computed(() => state.favorites.length)

export function isFavorite(id) {
  return state.favorites.some(f => f.id === id)
}

/** 切换收藏：已收藏则取消并返回 false，未收藏则加入并返回 true */
export function toggleFavorite(product) {
  if (!product || !product.id) return false
  const idx = state.favorites.findIndex(f => f.id === product.id)
  if (idx >= 0) {
    state.favorites.splice(idx, 1)
    persistFavorites()
    return false
  }
  state.favorites.push({
    id: product.id,
    name: product.name || '',
    subtitle: product.subtitle || '',
    image: (product.images && product.images[0]) || product.image || '',
    price: product.price || 0,
    originalPrice: product.originalPrice || 0,
    shopId: product.shopId || '',
    shopName: product.shopName || ''
  })
  persistFavorites()
  return true
}

export function removeFavorite(id) {
  const idx = state.favorites.findIndex(f => f.id === id)
  if (idx >= 0) {
    state.favorites.splice(idx, 1)
    persistFavorites()
  }
}

export function clearFavorites() {
  state.favorites.splice(0, state.favorites.length)
  persistFavorites()
}

/* ============ 优惠券（本地领取 + 持久化，正式核销待后端券接口） ============ */

// 可领取的券模板（静态，未来可由后端下发）
export const COUPON_TEMPLATES = [
  { id: 'newcomer-10', title: '新人专享券', type: 'reduce', value: 1000, threshold: 0, validDays: 30, tag: '新人', desc: '全场通用 · 无门槛' },
  { id: 'flower-20', title: '鲜花满减券', type: 'reduce', value: 2000, threshold: 9900, validDays: 30, tag: '满减', desc: '满 99 元可用 · 全场鲜花' },
  { id: 'birthday-15', title: '生日礼券', type: 'reduce', value: 1500, threshold: 0, validDays: 60, tag: '生日', desc: '全场通用 · 无门槛' }
]

function persistCoupons() {
  localStorage.setItem(COUPON_KEY, JSON.stringify(state.coupons))
}

function couponStatus(c) {
  if (c.status === 'used') return 'used'
  if (c.expireAt && Date.now() > c.expireAt) return 'expired'
  return 'unused'
}

export const availableCouponCount = computed(() =>
  state.coupons.filter(c => couponStatus(c) === 'unused').length
)

export function isCouponClaimed(id) {
  return state.coupons.some(c => c.id === id)
}

export function claimCoupon(id) {
  if (isCouponClaimed(id)) return false
  const tpl = COUPON_TEMPLATES.find(t => t.id === id)
  if (!tpl) return false
  const now = Date.now()
  state.coupons.push({
    ...tpl,
    claimedAt: now,
    expireAt: now + (tpl.validDays || 30) * 86400000,
    status: 'unused'
  })
  persistCoupons()
  return true
}

export function removeCoupon(id) {
  const idx = state.coupons.findIndex(c => c.id === id)
  if (idx >= 0) {
    state.coupons.splice(idx, 1)
    persistCoupons()
  }
}

export function markCouponUsed(id) {
  const c = state.coupons.find(x => x.id === id)
  if (c) {
    c.status = 'used'
    persistCoupons()
  }
}

export default state
