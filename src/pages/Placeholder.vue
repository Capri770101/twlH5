<template>
  <div class="page">
    <NavBar title="我的" />

    <!-- 用户卡 -->
    <div class="user-card clickable" @click="onUserTap">
      <div class="uc-avatar">
        <img v-if="store.isLogged && isImageUrl(store.userInfo.avatar)" :src="store.userInfo.avatar" alt="" />
        <span v-else>{{ (store.isLogged && store.userInfo.avatar) || '🌸' }}</span>
      </div>
      <div class="uc-info">
        <template v-if="store.isLogged">
          <div class="uc-name">{{ store.userInfo.nickname }}</div>
          <div class="uc-phone" v-if="store.userInfo.phone">{{ maskPhone(store.userInfo.phone) }}</div>
          <div class="uc-sub" v-else>点击管理你的账户</div>
        </template>
        <template v-else>
          <div class="uc-name">点击登录 / 注册</div>
          <div class="uc-sub">登录后查看订单与收货地址</div>
        </template>
      </div>
      <span class="uc-arrow">›</span>
    </div>

    <!-- 订单快捷 -->
    <div class="order-shortcuts card">
      <div class="os-head" @click="goOrders('all')">
        <span>我的订单</span>
        <span class="os-more">全部 ›</span>
      </div>
      <div class="os-grid">
        <div
          class="os-item"
          v-for="s in orderShortcuts"
          :key="s.value"
          @click="goOrders(s.value)"
        >
          <span class="os-icon">{{ s.icon }}</span>
          <span class="os-label">{{ s.label }}</span>
        </div>
      </div>
    </div>

    <!-- 功能列表 -->
    <ul class="menu card">
      <li v-if="store.isLogged" @click="router.push({ name: 'settings' })">
        <span class="m-left">⚙️ 账户设置</span>
        <span class="m-arrow">›</span>
      </li>
      <li @click="visibleAddr = true">
        <span class="m-left">📍 收货地址</span>
        <span class="m-arrow">›</span>
      </li>
      <li @click="router.push({ name: 'cart' })">
        <span class="m-left">🛒 我的购物车</span>
        <span class="m-arrow">›</span>
      </li>
      <li @click="router.push({ name: 'favorites' })">
        <span class="m-left">❤️ 我的收藏</span>
        <span class="m-arrow">›</span>
      </li>
      <li @click="router.push({ name: 'my-plans' })">
        <span class="m-left">💐 我的方案</span>
        <span class="m-arrow">›</span>
      </li>
      <li @click="router.push({ name: 'my-coupons' })">
        <span class="m-left">🎫 我的优惠券</span>
        <span class="m-arrow">›</span>
      </li>
      <li @click="router.push({ name: 'advisor' })">
        <span class="m-left">🤖 AI 花艺顾问</span>
        <span class="m-arrow">›</span>
      </li>
      <li @click="showService = true">
        <span class="m-left">💬 联系客服</span>
        <span class="m-arrow">›</span>
      </li>
    </ul>

    <button v-if="store.isLogged" class="logout-btn" @click="onLogout">退出登录</button>

    <!-- 固定 TabBar 占位（防止退出登录按钮被底部导航挡住） -->
    <div class="tabbar-placeholder"></div>

    <AddressManager v-model="visibleAddr" />

    <!-- 联系客服弹窗 -->
    <div v-if="showService" class="modal-mask" @click="showService = false"></div>
    <div v-if="showService" class="modal-content service-modal" @click.stop>
      <div class="sm-title">联系客服</div>
      <p class="sm-desc">{{ SERVICE.desc }}</p>
      <div class="sm-row">
        <span class="sm-label">客服电话</span>
        <span class="sm-value">{{ SERVICE.phone }}</span>
        <button class="sm-btn" @click="callService">拨打</button>
      </div>
      <div class="sm-row">
        <span class="sm-label">微信客服</span>
        <span class="sm-value">{{ SERVICE.wechat }}</span>
      </div>
      <div class="sm-row">
        <span class="sm-label">服务时间</span>
        <span class="sm-value">{{ SERVICE.hours }}</span>
      </div>
      <button class="sm-close" @click="showService = false">关闭</button>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import AddressManager from '@/components/AddressManager.vue'
import store, { logout } from '@/store'
import { toast } from '@/utils/toast'

const router = useRouter()
const visibleAddr = ref(false)

const orderShortcuts = [
  { label: '待付款', value: 'new', icon: '💰' },
  { label: '待接单', value: 'pending', icon: '📝' },
  { label: '配送中', value: 'delivering', icon: '🚚' },
  { label: '待评价', value: 'review', icon: '⭐' }
]

function goOrders(tab) {
  router.push({ name: 'orders', query: { tab } })
}

function onUserTap() {
  if (store.isLogged) router.push({ name: 'settings' })
  else router.push({ name: 'login' })
}

const showService = ref(false)
const SERVICE = {
  phone: '400-820-1995',
  wechat: 'tiaowulan_ai',
  hours: '每日 08:00 - 22:00',
  desc: '在线客服为您解答订花、配送、售后等问题，也可直接联系门店。'
}
function callService() {
  if (SERVICE.phone) location.href = 'tel:' + SERVICE.phone.replace(/-/g, '')
}

function maskPhone(p) {
  return String(p).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

function isImageUrl(s) {
  return /^https?:\/\//.test(s || '')
}

function onLogout() {
  logout()
  toast('已退出登录')
}

</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(40);
}

/* 用户卡 */
.user-card {
  display: flex;
  align-items: center;
  gap: rpx(24);
  padding: rpx(48) rpx(36);
  background: var(--primary-gradient);
  color: #fff;
  &.clickable { cursor: pointer; }
}
.uc-avatar {
  width: rpx(110);
  height: rpx(110);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(56);
  overflow: hidden;
  img { width: 100%; height: 100%; object-fit: cover; }
}
.uc-info { flex: 1; }
.uc-name { font-size: rpx(36); font-weight: 700; }
.uc-sub { margin-top: rpx(8); font-size: rpx(24); opacity: 0.85; }
.uc-phone { margin-top: rpx(8); font-size: rpx(24); opacity: 0.9; }
.uc-arrow { font-size: rpx(40); opacity: 0.85; }

/* 订单快捷 */
.order-shortcuts {
  margin: rpx(24);
  border-radius: var(--radius-md);
  padding: rpx(24) rpx(20);
}
.os-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: rpx(28);
  font-weight: 600;
  color: var(--text-primary);
  padding: 0 rpx(8) rpx(20);
  cursor: pointer;
}
.os-more { font-size: rpx(24); font-weight: 400; color: var(--text-light); }
.os-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: rpx(12);
}
.os-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: rpx(10);
  padding: rpx(12) 0;
  cursor: pointer;
}
.os-icon { font-size: rpx(46); }
.os-label { font-size: rpx(22); color: var(--text-secondary); }

/* 功能列表 */
.menu {
  margin: rpx(24);
  border-radius: var(--radius-md);
  overflow: hidden;
  list-style: none;
  padding: 0;
}
.menu li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: rpx(30) rpx(28);
  cursor: pointer;
  &:active { background: var(--bg-warm); }
}
.menu li + li { border-top: rpx(1) solid var(--border-light); }
.m-left { font-size: rpx(28); color: var(--text-primary); }
.m-arrow { color: var(--text-light); font-size: rpx(34); }

/* 退出 */
.logout-btn {
  display: block;
  width: calc(100% - #{rpx(48)});
  margin: rpx(40) rpx(24) 0;
  height: rpx(88);
  border: none;
  border-radius: var(--radius-md);
  background: #fff;
  color: #FF4D4F;
  font-size: rpx(30);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

/* 固定 TabBar 占位（TabBar 高 100rpx + 底部安全区） */
.tabbar-placeholder {
  height: calc(#{rpx(120)} + constant(safe-area-inset-bottom));
  height: calc(#{rpx(120)} + env(safe-area-inset-bottom));
}


/* 联系客服弹窗 */
.service-modal {
  left: 50%;
  transform: translateX(-50%);
  width: rpx(600);
  max-width: calc(100% - #{rpx(80)});
  border-radius: var(--radius-lg);
  padding: rpx(40) rpx(36) rpx(32);
  box-sizing: border-box;
}
.sm-title {
  font-size: rpx(34);
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  margin-bottom: rpx(16);
}
.sm-desc {
  font-size: rpx(24);
  color: var(--text-secondary);
  line-height: 1.6;
  text-align: center;
  margin: 0 0 rpx(24);
}
.sm-row {
  display: flex;
  align-items: center;
  gap: rpx(16);
  padding: rpx(20) 0;
  border-top: rpx(1) solid var(--border-light);
  font-size: rpx(28);
}
.sm-label {
  width: rpx(140);
  color: var(--text-secondary);
  flex-shrink: 0;
}
.sm-value {
  flex: 1;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sm-btn {
  flex-shrink: 0;
  border: none;
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(24);
  padding: rpx(10) rpx(24);
  border-radius: rpx(999);
}
.sm-close {
  width: 100%;
  height: rpx(84);
  margin-top: rpx(28);
  border: none;
  border-radius: var(--radius-md);
  background: var(--bg);
  color: var(--text-secondary);
  font-size: rpx(30);
  font-weight: 600;
}
</style>
