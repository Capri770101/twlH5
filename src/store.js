import { reactive, computed } from 'vue'

// 对应小程序 app.js 的 globalData
const state = reactive({
  userInfo: null,
  token: '',
  isLogged: false,
  cart: [],
  shopId: 'default',
  address: '深圳市盐田区海山路18号'
})

const CART_KEY = 'twd_cart'
const ADDR_KEY = 'twd_address'

// 恢复本地数据
try {
  const cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]')
  if (cart.length) state.cart = cart
  const addr = localStorage.getItem(ADDR_KEY)
  if (addr) state.address = addr
} catch (e) {
  /* 忽略损坏的本地数据 */
}

function persist() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart))
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
  persist()
}

export function changeQuantity(id, shopId, delta) {
  const item = state.cart.find(i => i.id === id && i.shopId === (shopId || 'default'))
  if (!item) return
  item.quantity += delta
  if (item.quantity < 1) item.quantity = 1
  persist()
}

export function removeFromCart(id, shopId) {
  const idx = state.cart.findIndex(i => i.id === id && i.shopId === (shopId || 'default'))
  if (idx >= 0) state.cart.splice(idx, 1)
  persist()
}

export function clearCart() {
  state.cart.splice(0, state.cart.length)
  persist()
}

export function setAddress(addr) {
  state.address = addr
  localStorage.setItem(ADDR_KEY, addr)
}

/** 分 → 元，整数不带小数（与小程序 WXML 里 price/100 的显示一致） */
export const money = fen => {
  const v = (fen || 0) / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

export default state
