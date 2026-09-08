<template>
  <div class="page">
    <NavBar :title="title" />
    <div class="empty-state">
      <span class="empty-icon">🌸</span>
      <span class="empty-text">{{ title }}页面开发中</span>
      <span class="empty-hint">本轮已打样：首页、分类、详情、购物车、结算、订单</span>
      <div v-if="title === '我的'" class="entry-list">
        <button class="entry-item" @click="router.push({ name: 'orders' })">
          <span>📋 我的订单</span>
          <span class="entry-arrow">›</span>
        </button>
        <button class="entry-item" @click="router.push({ name: 'cart' })">
          <span>🛒 购物车</span>
          <span class="entry-arrow">›</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'

const route = useRoute()
const router = useRouter()
const title = route.meta.title || ''
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: rpx(160) 0;
  gap: rpx(16);
}
.empty-icon {
  font-size: rpx(96);
  opacity: 0.5;
}
.empty-text {
  color: var(--text-secondary);
  font-size: var(--fs-title);
}
.empty-hint {
  color: var(--text-light);
  font-size: var(--fs-minor);
}
.entry-list {
  margin-top: rpx(48);
  width: rpx(560);
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.entry-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: rpx(28) rpx(24);
  border: none;
  background: #fff;
  font-size: var(--fs-title);
  color: var(--text-primary);
}
.entry-item + .entry-item {
  border-top: rpx(1) solid var(--border-light);
}
.entry-arrow {
  color: var(--text-light);
  font-size: rpx(34);
  line-height: 1;
}
</style>
