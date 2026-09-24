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
          <button class="btn btn-outline btn-sm" @click="callRider">联系骑手</button>
        </div>
      </div>

      <!-- 门店履约进度（订单已同步给出花门店时展示；进度由商家后端回捞） -->
      <div v-if="order.merchant && order.merchant.synced" class="section-card merchant-card">
        <div class="section-title-row">
          <span class="section-title">🏪 门店履约进度</span>
          <span class="merchant-badge">来自门店</span>
        </div>
        <div class="merchant-row">
          <span class="merchant-status">{{ order.merchant.statusText || '已通知门店' }}</span>
          <span v-if="order.merchant.statusAt" class="merchant-time">{{ order.merchant.statusAt }}</span>
        </div>
        <div v-if="order.merchant.refundAuditText" class="merchant-row merchant-refund">
          <span>退款审核：{{ order.merchant.refundAuditText }}</span>
        </div>
        <p class="merchant-tip">订单已同步给出花门店，进度由门店实时更新</p>
      </div>
      <div v-else-if="order.merchant && order.merchant.pendingSync" class="section-card merchant-card">
        <div class="section-title-row">
          <span class="section-title">🏪 门店履约进度</span>
        </div>
        <p class="merchant-tip">正在通知出花门店，稍后刷新即可看到门店进度</p>
        <p v-if="order.merchant.error" class="merchant-err">{{ order.merchant.error }}</p>
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
        <!-- 退款信息：申请后由服务端落库回显（退款单号/金额/原因/时间）-->
        <template v-if="order.refund">
          <div class="info-row">
            <span class="info-label">退款金额</span>
            <span class="info-value refund-amount">{{ money(order.refund.amount) }}</span>
          </div>
          <div v-if="order.refund.reason" class="info-row">
            <span class="info-label">退款原因</span>
            <span class="info-value">{{ order.refund.reason }}</span>
          </div>
          <div v-if="order.refund.applyTime" class="info-row">
            <span class="info-label">申请时间</span>
            <span class="info-value">{{ order.refund.applyTime }}</span>
          </div>
          <div v-if="order.refund.time" class="info-row">
            <span class="info-label">退款时间</span>
            <span class="info-value">{{ order.refund.time }}</span>
          </div>
          <div v-if="order.refund.no" class="info-row">
            <span class="info-label">退款单号</span>
            <span class="info-value">{{ order.refund.no }}</span>
          </div>
        </template>
        <div v-if="order.cardContent" class="info-row">
          <span class="info-label">💌 贺卡</span>
          <span class="info-value card-content">{{ order.cardContent }}</span>
        </div>
        <template v-if="order.card && order.card.cards && order.card.cards.length">
          <div v-for="(card, index) in order.card.cards" :key="card.localId || index" class="info-row card-image-row">
            <span class="info-label">贺卡 {{ index + 1 }}</span>
            <div>
              <span v-if="card.text" class="info-value card-content">{{ card.text }}</span>
              <img v-if="card.image_url" class="order-card-image" :src="card.image_url" alt="贺卡预览" />
              <small v-if="card.itemId" class="card-item-bind">对应商品：{{ card.itemId }}</small>
            </div>
          </div>
        </template>
        <div v-else-if="order.card && order.card.image_url" class="info-row card-image-row">
          <span class="info-label">贺卡预览</span>
          <img class="order-card-image" :src="order.card.image_url" alt="贺卡预览" />
        </div>
        <div v-if="order._canRefund" class="info-row aftersale-entry" @click="showRefund = true">
          <span class="info-label">售后服务</span>
          <div class="aftersale-entry-value">
            <span>申请售后/退款</span>
            <span class="aftersale-entry-arrow">›</span>
          </div>
        </div>
        <RefundDialog v-model:visible="showRefund" :order="order" @success="onRefundSuccess" @error="toast" />
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
          <button class="review-entry-button" @click="goReview">去评价</button>
        </template>
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getOrderDetail } from '@/mock/api'
import { money } from '@/store'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import RefundDialog from '@/components/RefundDialog.vue'
import { toast } from '@/utils/toast'

const route = useRoute()
const router = useRouter()
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
    pending: '商家已接单，正在为您准备',
    // 退款审核中：资金尚未发生任何变动，别让用户以为钱在路上
    refund_applying: '退款申请已提交，商家审核通过后原路退回',
    refunding: '退款正在处理中，请留意到账通知'
  }
  return map[o.status] || '订单已提交，请尽快支付'
})

function copyId() {
  if (navigator.clipboard) navigator.clipboard.writeText(order.value.id)
  toast('已复制订单号')
}

function callRider() {
  const phone = order.value?.deliveryInfo?.phone
  if (phone) location.href = 'tel:' + String(phone).replace(/[^0-9]/g, '')
  else toast('暂未获取到骑手电话')
}

function goReview() {
  if (!order.value) return
  router.push({ name: 'review', params: { orderId: order.value.id } })
}


const showRefund = ref(false)
async function onRefundSuccess(res) {
  // 审核模式：申请后仅进入「退款审核中」，资金未动 —— 文案必须说清，别谎称"处理中"
  if (res && res.pendingReview) {
    toast('退款申请已提交，等待商家审核')
    await reload()
    return
  }
  const st = (res && res.status) || 'refunding'
  toast(
    st === 'refunded' ? '退款已原路退回'
      : st === 'refund_applying' ? '退款申请已提交，等待商家审核'
        : st === 'refund_failed' ? '退款未成功，可稍后重试或联系客服'
          : '已提交退款申请，处理中'
  )
  // 重新拉取详情：状态以服务端为准（以前只改内存，刷新后回到「已支付」）
  await reload()
}

async function reload() {
  try {
    order.value = await getOrderDetail(route.params.id)
  } catch (e) {
    /* 保持当前内容，由页面已有逻辑提示 */
  }
}

onMounted(async () => {
  await reload()
  loading.value = false
})

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
  color: var(--primary);  padding: rpx(4) rpx(16);
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
/* 门店履约进度（进度来自商家后端，故与平台自身状态区分标识） */
.merchant-card {
  border-left: rpx(6) solid var(--primary);
}
.merchant-badge {
  margin-left: auto;
  font-size: rpx(20);
  line-height: 1.6;
  padding: 0 rpx(10);
  border-radius: rpx(6);
  color: #3F9E6A;
  background: #EAF6EF;
  border: 1px solid #CBE8D7;
}
.merchant-row {
  display: flex;
  align-items: baseline;
  gap: rpx(12);
  margin-top: rpx(12);
}
.merchant-status {
  font-size: rpx(28);
  font-weight: 600;
  color: var(--text-primary);
}
.merchant-time {
  font-size: rpx(22);
  color: var(--text-light);
}
.merchant-refund {
  font-size: rpx(24);
  color: var(--text-secondary);
}
.merchant-tip {
  margin-top: rpx(10);
  font-size: rpx(22);
  color: var(--text-light);
  line-height: 1.6;
}
.merchant-err {
  margin-top: rpx(6);
  font-size: rpx(22);
  color: #D8453B;
  line-height: 1.6;
}
.refund-amount {
  color: #E8615D;
  font-weight: 600;
}
.order-card-image {
  display: block;
  width: rpx(180);
  max-height: rpx(240);
  object-fit: cover;
  border-radius: rpx(8);
  margin-top: rpx(10);
}
.card-item-bind {
  display: block;
  margin-top: rpx(8);
  color: #8A9099;
  font-size: var(--fs-caption);
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

</style>
