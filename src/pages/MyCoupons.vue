<template>
  <div class="page">
    <NavBar title="我的优惠券" />

    <div class="tabs">
      <div class="tab" :class="{ active: tab === 'unused' }" @click="tab = 'unused'">
        可用 ({{ countUnused }})
      </div>
      <div class="tab" :class="{ active: tab === 'used' }" @click="tab = 'used'">已使用</div>
      <div class="tab" :class="{ active: tab === 'expired' }" @click="tab = 'expired'">已过期</div>
    </div>

    <div class="coupon-list" v-if="filtered.length">
      <div class="coupon-card" v-for="c in filtered" :key="c.id" :class="tab">
        <div class="cc-left">
          <div class="cc-amount"><span class="cc-symbol">¥</span>{{ money(c.value) }}</div>
          <div class="cc-threshold">{{ c.threshold ? '满' + money(c.threshold) + '可用' : '无门槛' }}</div>
        </div>
        <div class="cc-mid">
          <div class="cc-title">{{ c.title }}</div>
          <div class="cc-desc">{{ c.desc }}</div>
          <div class="cc-expire" v-if="tab === 'unused'">有效期至 {{ formatDate(c.expireAt) }}</div>
        </div>
        <div class="cc-right" v-if="tab === 'unused'">
          <button class="cc-btn" @click="goUse">去使用</button>
        </div>
      </div>
    </div>

    <div class="empty" v-else>
      <div class="empty-emoji">🎫</div>
      <div class="empty-text">{{ tab === 'unused' ? '还没有可用优惠券，去领券中心看看~' : '暂无记录' }}</div>
      <button class="empty-btn" v-if="tab === 'unused'" @click="goCenter">去领券中心</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import store, { money } from '@/store'

const router = useRouter()
const tab = ref('unused')

function statusOf(c) {
  if (c.status === 'used') return 'used'
  if (c.expireAt && Date.now() > c.expireAt) return 'expired'
  return 'unused'
}

const filtered = computed(() => store.coupons.filter(c => statusOf(c) === tab.value))
const countUnused = computed(() => store.coupons.filter(c => statusOf(c) === 'unused').length)

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function goUse() {
  router.push({ name: 'category' })
}
function goCenter() {
  router.push({ name: 'coupons' })
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(40);
}
.tabs {
  display: flex;
  gap: rpx(12);
  padding: rpx(24) rpx(24) rpx(8);
}
.tab {
  flex: 1;
  text-align: center;
  font-size: rpx(26);
  color: var(--text-secondary);
  padding: rpx(16) 0;
  border-radius: rpx(12);
  background: #fff;
}
.tab.active {
  color: #fff;
  background: var(--primary-gradient);
  font-weight: 700;
}
.coupon-list {
  padding: rpx(16) rpx(24);
  display: flex;
  flex-direction: column;
  gap: rpx(20);
}
.coupon-card {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.cc-left {
  width: rpx(200);
  background: var(--primary-gradient);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: rpx(40) 0;
  align-self: stretch;
}
.cc-amount { font-size: rpx(56); font-weight: 800; line-height: 1; }
.cc-symbol { font-size: rpx(28); margin-right: rpx(4); }
.cc-threshold { font-size: rpx(20); opacity: 0.9; margin-top: rpx(10); }
.cc-mid {
  flex: 1;
  padding: rpx(24) rpx(20);
  min-width: 0;
}
.cc-title { font-size: rpx(30); font-weight: 700; color: var(--text-primary); }
.cc-desc { font-size: rpx(22); color: var(--text-secondary); margin-top: rpx(8); }
.cc-expire { font-size: rpx(20); color: var(--text-light); margin-top: rpx(12); }
.cc-right { padding: rpx(24); }
.cc-btn {
  border: none;
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(26);
  padding: rpx(14) rpx(28);
  border-radius: rpx(999);
}
.coupon-card.expired,
.coupon-card.used {
  filter: grayscale(1);
  opacity: 0.6;
}
.empty {
  text-align: center;
  padding: rpx(120) rpx(40);
}
.empty-emoji { font-size: rpx(100); }
.empty-text { font-size: rpx(28); color: var(--text-secondary); margin: rpx(24) 0; }
.empty-btn {
  border: none;
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(28);
  padding: rpx(18) rpx(48);
  border-radius: rpx(999);
}
</style>
