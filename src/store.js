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
  selectedAddress: null
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

export default state
