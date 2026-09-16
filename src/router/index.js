import { createRouter, createWebHistory } from 'vue-router'
import state from '@/store'

const routes = [
  { path: '/', name: 'home', component: () => import('@/pages/Home.vue'), meta: { tab: true } },
  { path: '/cart', name: 'cart', component: () => import('@/pages/Cart.vue'), meta: { tab: true } },
  { path: '/profile', name: 'profile', component: () => import('@/pages/Placeholder.vue'), meta: { tab: true, title: '我的', requiresAuth: true } },
  { path: '/category', name: 'category', component: () => import('@/pages/Category.vue') },
  { path: '/checkout', name: 'checkout', component: () => import('@/pages/Checkout.vue') },
  { path: '/orders', name: 'orders', component: () => import('@/pages/Orders.vue'), meta: { requiresAuth: true } },
  { path: '/order/:id', name: 'order-detail', component: () => import('@/pages/OrderDetail.vue'), meta: { requiresAuth: true } },
  // 手机支付页：PC 扫码支付兜底通道的落地页（二维码指向本页，手机微信内用 JSAPI 付款）
  { path: '/pay/:outTradeNo', name: 'mobile-pay', component: () => import('@/pages/MobilePay.vue'), meta: { requiresAuth: true, title: '确认支付' } },
  { path: '/detail/:id', name: 'detail', component: () => import('@/pages/Detail.vue') },
  { path: '/shop/:id', name: 'shop-detail', component: () => import('@/pages/ShopDetail.vue') },
  { path: '/shops', name: 'shops', component: () => import('@/pages/Shops.vue') },
  { path: '/advisor', name: 'advisor', component: () => import('@/pages/Advisor.vue') },
  { path: '/login', name: 'login', component: () => import('@/pages/Login.vue') },
  // PC 扫码后手机端打开的「确认授权登录」页（只有确认按钮）
  { path: '/pc-confirm', name: 'pc-confirm', component: () => import('@/pages/PcConfirm.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/pages/Settings.vue'), meta: { requiresAuth: true } },
  { path: '/favorites', name: 'favorites', component: () => import('@/pages/Favorites.vue') },
  { path: '/coupons', name: 'coupons', component: () => import('@/pages/CouponCenter.vue') },
  { path: '/my-coupons', name: 'my-coupons', component: () => import('@/pages/MyCoupons.vue') },
  { path: '/search', name: 'search', component: () => import('@/pages/Search.vue') },
  { path: '/my-plans', name: 'my-plans', component: () => import('@/pages/MyPlans.vue') },
  { path: '/review/:orderId', name: 'review', component: () => import('@/pages/Review.vue') }
]

// 开发态卡片自检页（仅本地 dev，不进生产包）
if (import.meta.env.DEV) {
  routes.push({ path: '/card-lab', name: 'card-lab', component: () => import('@/pages/CardLab.vue') })
}

const router = createRouter({
  routes,
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { top: 0 }
  }
})

// 需登录的页面未登录则跳登录页，并携带 redirect 回跳
router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth && !state.isLogged) {
    next({ name: 'login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
