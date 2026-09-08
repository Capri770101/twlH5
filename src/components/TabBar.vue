<template>
  <nav class="tabbar safe-bottom">
    <button
      v-for="item in tabs"
      :key="item.name"
      class="tabbar-item"
      :class="{ active: isActive(item) }"
      @click="go(item)"
    >
      <span class="tabbar-icon-wrap">
        <img class="tabbar-icon" :src="isActive(item) ? item.activeIcon : item.icon" :alt="item.text" />
        <span v-if="item.name === 'cart' && cartCount > 0" class="badge">{{ cartCount > 99 ? '99+' : cartCount }}</span>
      </span>
      <span class="tabbar-text">{{ item.text }}</span>
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { cartCount } from '@/store'

const route = useRoute()
const router = useRouter()

const tabs = [
  { name: 'home', text: '首页', icon: '/images/tab-home.png', activeIcon: '/images/tab-home-active.png' },
  { name: 'cart', text: '购物车', icon: '/images/tab-cart.png', activeIcon: '/images/tab-cart-active.png' },
  { name: 'profile', text: '我的', icon: '/images/tab-order.png', activeIcon: '/images/tab-order-active.png' }
]

const isActive = item =>
  item.name === 'home'
    ? route.name === 'home'
    : route.name === item.name

const go = item => router.push({ name: item.name })
</script>

<style lang="scss" scoped>
.tabbar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1rem;
  z-index: 90;
  display: flex;
  height: rpx(100);
  background: #ffffff;
  border-top: rpx(1) solid #f2efe9;
}

.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: rpx(4);
  border: none;
  background: transparent;
  padding: 0;
}

.tabbar-icon-wrap {
  position: relative;
  display: block;
  width: rpx(46);
  height: rpx(46);
}

.tabbar-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.tabbar-text {
  font-size: var(--fs-label);
  line-height: 1;
  color: #B2BEC3;
  font-weight: 500;
}

.tabbar-item.active .tabbar-text {
  color: var(--primary);
}
</style>
