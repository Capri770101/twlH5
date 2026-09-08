<template>
  <div class="page">
    <NavBar title="订单详情" />

    <div v-if="loading" class="loading-state">
      <div class="skeleton" :style="{ height: rpx(200), margin: rpx(16) + ' ' + rpx(24) }"></div>
      <div class="skeleton" :style="{ height: rpx(300), margin: rpx(16) + ' ' + rpx(24) }"></div>
    </div>

    <template v-if="order">
      <!-- 状态卡片 -->
      <div class="status-card" :style="{ background: statusGradient }">
        <div class="status-icon">{{ statusIcon }}</div>
        <span class="status-title">{{ order.statusText }}</span>
        <span class="status-desc">{{ statusDesc }}</span>
      </div>

      <!-- 配送信息 -->
      <div v-if="order.deliveryInfo" class="section-card">
        <div class="delivery-info">
          <span class="delivery-label">🏍️ 配送信息</span>
          <div class="delivery-detail">
            <span>骑手：{{ order.deliveryInfo.rider }}</span>
            <span>电话：{{ order.deliveryInfo.phone }}</span>
            <span>预计：{{ order.deliveryInfo.estimatedTime }}</span>
          </div>
          <button class="btn btn-outline btn-sm" @click="toast('拨号功能开发中')">联系骑手</button>
        </div>
      </div>

      <!-- 商品信息 -->
      <div class="section-card">
        <div class="section-title-row">
          <span class="section-title">💐 商品信息</span>
        </div>
        <div v-for="(item, i) in order.items" :key="i" class="goods-item">
          <div class="goods-img">
            <FlowerImage :src="item.image" emoji="💐" />
          </div>
          <div class="goods-info">
            <span class="goods-name">{{ item.name }}</span>
            <div class="goods-price-row">
              <span class="price price-sm">{{ money(item.price) }}</span>
              <span class="goods-qty">x{{ item.quantity }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 费用明细 -->
      <div class="section-card">
        <span class="section-title">💰 费用明细</span>
        <div class="fee-row">
          <span class="fee-label">商品合计</span>
          <span class="price price-xs">{{ money(order.totalPrice) }}</span>
        </div>
        <div class="fee-row">
          <span class="fee-label">配送费</span>
          <span style="color: var(--secondary);">免配送费</span>
        </div>
        <div class="fee-row fee-total">
          <span class="fee-label">实付金额</span>
          <span class="price price-md">{{ money(order.totalPrice) }}</span>
        </div>
      </div>

      <!-- 订单信息 -->
      <div class="section-card">
        <span class="section-title">📋 订单信息</span>
        <div class="info-row">
          <span class="info-label">订单编号</span>
          <div class="info-value-row">
            <span class="info-value">{{ order.id }}</span>
            <span class="info-copy" @click="copyId">复制</span>
          </div>
        </div>
        <div class="info-row">
          <span class="info-label">创建时间</span>
          <span class="info-value">{{ order.createTime }}</span>
        </div>
        <div v-if="order.expectDeliveryTime" class="info-row">
          <span class="info-label">配送时间</span>
          <span class="info-value">{{ order.expectDeliveryTime }}</span>
        </div>
        <template v-if="order.pickupMethod !== 'pickup'">
          <div class="info-row">
            <span class="info-label">收货人</span>
            <span class="info-value">{{ order.address.name }} {{ order.address.phone }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">收货地址</span>
            <span class="info-value">{{ order.address.detail }}</span>
          </div>
        </template>
        <div v-if="order.pickupMethod === 'pickup'" class="info-row">
          <span class="info-label">配送方式</span>
          <span class="info-value pickup-flag">🏪 到店自取</span>
        </div>
        <div v-if="order.payTime" class="info-row">
          <span class="info-label">支付时间</span>
          <span class="info-value">{{ order.payTime }}</span>
        </div>
        <div v-if="order.cardContent" class="info-row">
          <span class="info-label">💌 贺卡</span>
          <span class="info-value card-content">{{ order.cardContent }}</span>
        </div>
        <div v-if="order._canRefund" class="info-row aftersale-entry" @click="toast('售后页面开发中')">
          <span class="info-label">售后服务</span>
          <div class="aftersale-entry-value">
            <span>申请售后/退款</span>
            <span class="aftersale-entry-arrow">›</span>
          </div>
        </div>
      </div>

      <!-- 订单评价 -->
      <div v-if="order.status === 'completed'" class="section-card review-section">
        <template v-if="order._hasReview">
          <div class="review-title-row">
            <span class="section-title">订单评价</span>
            <div class="review-stars">
              <span
                v-for="star in 5"
                :key="star"
                class="review-star"
                :class="{ active: star <= order.reviewRating }"
              >★</span>
            </div>
          </div>
          <div v-if="order.reviewTags && order.reviewTags.length" class="review-tags">
            <span v-for="tag in order.reviewTags" :key="tag">{{ tag }}</span>
          </div>
          <span class="review-content">{{ order.review }}</span>
        </template>
        <template v-else>
          <span class="section-title">评价本次订单</span>
          <span class="review-entry-desc">分享花材、包装、配送或服务体验</span>
          <button class="review-entry-button" @click="toast('评价页开发中')">去评价</button>
        </template>
      </div>
    </template>

    <div v-if="toastText" class="twd-toast">{{ toastText }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { getOrderDetail } from '@/mock/api'
import { money } from '@/store'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'

const route = useRoute()
const rpx = n => `${n / 750}rem`

const order = ref(null)
const loading = ref(true)

const statusIcon = computed(() => {
  const map = { completed: '✅', delivering: '🚚', making: '🌸' }
  return (order.value && map[order.value.status]) || '⏳'
})

const statusGradient = computed(() => {
  const fromMap = {
    completed: '#E8FAF8',
    delivering: '#EBF0FF',
    making: '#FFF9E6'
  }
  const from = (order.value && fromMap[order.value.status]) || '#FFF0F0'
  return `linear-gradient(135deg, ${from} 0%, #FFF 100%)`
})

const statusDesc = computed(() => {
  if (!order.value) return ''
  const o = order.value
  if (o.status === 'delivering' && o.deliveryInfo) {
    return `骑手${o.deliveryInfo.rider}正在配送，${o.deliveryInfo.estimatedTime}`
  }
  const map = {
    making: '花艺师正在精心制作您的花束',
    completed: '感谢您的购买，期待再次光临',
    pending: '商家已接单，正在为您准备'
  }
  return map[o.status] || '订单已提交，请尽快支付'
})

function copyId() {
  if (navigator.clipboard) navigator.clipboard.writeText(order.value.id)
  toast('已复制订单号')
}

const toastText = ref('')
let toastTimer = null
function toast(text) {
  toastText.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}

onMounted(async () => {
  order.value = await getOrderDetail(route.params.id)
  loading.value = false
})

onUnmounted(() => clearTimeout(toastTimer))
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(20);
}

/* 状态卡片 */
.status-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: rpx(40) rpx(24);
  margin: 0 rpx(24) rpx(16);
  border-radius: var(--radius-lg);
  text-align: center;
}
.status-icon {
  font-size: rpx(64);
  margin-bottom: rpx(12);
}
.status-title {
  font-size: rpx(34);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: rpx(8);
}
.status-desc {
  font-size: var(--fs-body);
  color: var(--text-secondary);
}

/* 通用区块 */
.section-card {
  background: #fff;
  margin: 0 rpx(24) rpx(16);
  border-radius: var(--radius-md);
  padding: rpx(24);
  box-shadow: var(--shadow-sm);
}
.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: rpx(16);
}
.section-title {
  font-size: rpx(28);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0;
  display: block;
}

/* 配送信息 */
.delivery-info {
  position: relative;
}
.delivery-label {
  font-size: rpx(28);
  font-weight: 600;
  display: block;
  margin-bottom: rpx(12);
}
.delivery-detail {
  display: flex;
  flex-direction: column;
  gap: rpx(6);
  font-size: var(--fs-body);
  color: var(--text-secondary);
  margin-bottom: rpx(16);
}

/* 商品 */
.goods-item {
  display: flex;
  gap: rpx(16);
  padding: rpx(12) 0;
}
.goods-item + .goods-item {
  border-top: rpx(1) solid var(--border-light);
}
.goods-img {
  width: rpx(100);
  height: rpx(100);
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}
.goods-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: rpx(8);
  min-width: 0;
}
.goods-name {
  font-size: rpx(28);
}
.goods-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.goods-qty {
  font-size: var(--fs-minor);
  color: var(--text-light);
}
.price-xs { font-size: var(--fs-body); }
.price-sm { font-size: rpx(28); }
.price-md { font-size: rpx(32); }

/* 费用 */
.fee-row {
  display: flex;
  justify-content: space-between;
  padding: rpx(10) 0;
}
.fee-row + .fee-row {
  border-top: rpx(1) solid var(--border-light);
}
.fee-label {
  font-size: var(--fs-body);
  color: var(--text-secondary);
}
.fee-total {
  margin-top: rpx(8);
  padding-top: rpx(16);
  border-top-style: dashed;
}
.fee-total .fee-label {
  font-size: rpx(30);
  color: var(--text-primary);
  font-weight: 600;
}

/* 订单信息 */
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: rpx(12) 0;
  gap: rpx(16);
}
.info-row + .info-row {
  border-top: rpx(1) solid var(--border-light);
}
.info-label {
  font-size: var(--fs-body);
  color: var(--text-secondary);
  flex-shrink: 0;
}
.info-value-row {
  display: flex;
  align-items: center;
  gap: rpx(12);
}
.info-value {
  font-size: var(--fs-body);
  color: var(--text-primary);
  text-align: right;
  word-break: break-all;
}
.info-copy {
  font-size: var(--fs-caption);
  color: var(--primary);
  padding: rpx(4) rpx(16);
  background: var(--primary-light);
  border-radius: rpx(6);
  flex-shrink: 0;
}
.pickup-flag {
  color: #FF6B6B;
  font-weight: 600;
}
.card-content {
  color: #FF6B6B;
}
.aftersale-entry {
  margin-top: rpx(4);
}
.aftersale-entry-value {
  display: flex;
  align-items: center;
  gap: rpx(8);
  color: #8A9099;
  font-size: var(--fs-minor);
}
.aftersale-entry-arrow {
  color: #B6BBC2;
  font-size: rpx(34);
  line-height: 1;
}

/* 评价 */
.review-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: rpx(16);
}
.review-stars {
  display: flex;
  flex-shrink: 0;
}
.review-star {
  color: #DADDE1;
  font-size: rpx(29);
}
.review-star.active {
  color: #FFB020;
}
.review-tags {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(10);
  margin-top: rpx(18);
}
.review-tags span {
  padding: rpx(8) rpx(14);
  border-radius: rpx(6);
  background: #FFF3F2;
  color: #C94743;
  font-size: var(--fs-caption);
}
.review-content {
  display: block;
  margin-top: rpx(18);
  color: #4B535E;
  font-size: var(--fs-body);
  line-height: 1.65;
}
.review-entry-desc {
  display: block;
  margin-top: rpx(10);
  color: #8A9099;
  font-size: var(--fs-minor);
}
.review-entry-button {
  height: rpx(72);
  width: 100%;
  margin-top: rpx(22);
  border: rpx(1) solid #E8615D;
  border-radius: rpx(8);
  background: #fff;
  color: #D9524E;
  font-size: var(--fs-body);
  font-weight: 650;
}

.loading-state {
  padding-top: rpx(16);
}

.twd-toast {
  position: fixed;
  left: 50%;
  bottom: rpx(120);
  transform: translateX(-50%);
  padding: rpx(16) rpx(32);
  border-radius: rpx(40);
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: var(--fs-minor);
  z-index: 200;
  animation: fadeIn 0.2s ease-out;
}
</style>
