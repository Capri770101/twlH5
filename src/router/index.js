import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('@/pages/Home.vue'), meta: { tab: true } },
  { path: '/cart', name: 'cart', component: () => import('@/pages/Cart.vue'), meta: { tab: true } },
  { path: '/profile', name: 'profile', component: () => import('@/pages/Placeholder.vue'), meta: { tab: true, title: '我的' } },
  { path: '/category', name: 'category', component: () => import('@/pages/Category.vue') },
  { path: '/checkout', name: 'checkout', component: () => import('@/pages/Checkout.vue') },
  { path: '/orders', name: 'orders', component: () => import('@/pages/Orders.vue') },
  { path: '/order/:id', name: 'order-detail', component: () => import('@/pages/OrderDetail.vue') },
  { path: '/detail/:id', name: 'detail', component: () => import('@/pages/Detail.vue') },
  { path: '/shop/:id', name: 'shop-detail', component: () => import('@/pages/ShopDetail.vue') }
]

export default createRouter({
  routes,
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    return savedPosition || { top: 0 }
  }
})
