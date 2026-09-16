<template>
  <div class="page">
    <NavBar title="我的订单" />

    <!-- 状态 Tab -->
    <div class="order-tabs">
      <div
        v-for="item in tabs"
        :key="item.value"
        class="order-tab"
        :class="{ active: activeTab === item.value }"
        @click="onTabChange(item.value)"
      >{{ item.label }}</div>
    </div>

    <!-- 订单列表 -->
    <div v-if="orders.length && !loading" class="order-list">
      <div v-for="order in orders" :key="order.id" class="order-card card-padded" @click="goDetail(order.id)">
        <div class="order-header">
          <span class="order-id">订单号：{{ order.id }}</span>
          <div class="order-header-right">
            <span class="order-status" :class="order.status">{{ order.statusText }}</span>
          </div>
        </div>

        <div class="order-goods">
          <div v-for="(goods, i) in order.items" :key="i" class="order-goods-item">
            <div class="order-goods-img">
              <FlowerImage :src="goods.image" emoji="💐" />
            </div>
            <div class="order-goods-info">
              <div class="order-goods-title-wrap">
                <span class="order-goods-name">{{ goods.name }}</span>
              </div>
              <span class="order-goods-qty">x{{ goods.quantity }}</span>
            </div>
            <span class="order-goods-price price price-sm">{{ money(goods.price) }}</span>
          </div>
        </div>

        <div class="order-footer">
          <span class="order-time">{{ order.createTime }}</span>
          <div class="order-total">
            <span>共{{ order._totalQty }}件 合计：</span>
            <span class="price price-md">{{ money(order.totalPrice) }}</span>
          </div>
        </div>

        <div v-if="order.status === 'new'" class="order-actions">
          <button class="btn btn-outline btn-sm" :disabled="actingId === order.id" @click.stop="onCancel(order)">
            {{ actingId === order.id ? '处理中…' : '取消订单' }}
          </button>
          <button class="btn btn-primary btn-sm" :disabled="actingId === order.id" @click.stop="onPay(order)">
            {{ actingId === order.id ? '处理中…' : '去支付' }}
          </button>
        </div>
        <div v-else-if="order.status === 'completed'" class="order-actions">
          <button v-if="!order._hasReview" class="btn btn-outline btn-sm" @click.stop="goReview(order.id)">去评价</button>
          <button class="btn btn-primary btn-sm" @click.stop="repeatOrder(order)">再来一单</button>
        </div>
        <div v-else-if="!['refunding', 'refunded', 'refund_failed', 'cancelled'].includes(order.status)" class="order-actions">
          <button v-if="order._canRefund" class="btn btn-outline btn-sm" @click.stop="openRefund(order)">申请退款</button>
          <button class="btn btn-primary btn-sm" @click.stop="repeatOrder(order)">再来一单</button>
        </div>
        <div v-if="order.status === 'refunding'" class="order-actions">
          <span class="order-refunding-tip">等待商家处理退款…</span>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!orders.length && !loading && !loadError" class="empty-state">
      <span class="empty-icon">📋</span>
      <span class="empty-text">暂无相关订单</span>
      <button class="btn btn-primary empty-btn" @click="router.push({ name: 'home' })">去逛逛</button>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <div v-for="n in 3" :key="n" class="skeleton" :style="{ height: rpx(200), margin: rpx(16) + ' ' + rpx(24) }"></div>
    </div>

    <!-- 加载失败：可重试（未登录/网络异常时给出明确出口） -->
    <StateBlock
      v-if="!loading && loadError"
      type="error"
      emoji="😵"
      :text="loadError"
      hint="请检查网络或重新登录后重试"
      @retry="load"
    />


    <RefundDialog v-model:visible="showRefund" :order="refundTarget" @success="onRefundSuccess" @error="toast" />
  </div>

  <!-- PC 扫码支付面板（非微信环境重新支付时弹出） -->
  <QrPayPanel
    v-model:visible="qrPay.visible"
    :out-trade-no="qrPay.outTradeNo"
    :shop-id="qrPay.shopId"
    :amount-fen="qrPay.amountFen"
    :mode="qrPay.mode"
    :qr-data-url="qrPay.qrDataUrl"
    :code-url="qrPay.codeUrl"
    @success="onQrPaid"
    @close="onQrClose"
    @expire="onQrClose"
  />
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getOrderList, cancelOrder, payOrder } from '@/mock/api'
import { money, addToCart } from '@/store'
import store from '@/store'
import { isMobileWeChat, invokeWxPay, payFailHint } from '@/utils/wxpay'
import { linkQrDataUrl, mobilePayUrl } from '@/utils/qr'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import RefundDialog from '@/components/RefundDialog.vue'
import StateBlock from '@/components/StateBlock.vue'
import QrPayPanel from '@/components/QrPayPanel.vue'
import { toast } from '@/utils/toast'

const route = useRoute()
const router = useRouter()
const rpx = n => `${n / 750}rem`

// PC 扫码支付（Native）面板状态
const qrPay = reactive({
  visible: false,
  outTradeNo: '',
  shopId: '',
  amountFen: 0,
  mode: 'native', // native=微信支付码 / link=兜底（二维码指向手机支付页）
  qrDataUrl: '',
  codeUrl: ''
})

// PC 兜底通道：二维码指向「手机支付页」，用户手机微信扫码后在手机上用 JSAPI 付款
async function openLinkQrPay(id, shop, amountFen) {
  const url = mobilePayUrl(id)
  const qrDataUrl = await linkQrDataUrl(url)
  if (!qrDataUrl) return false
  qrPay.outTradeNo = id
  qrPay.shopId = shop
  qrPay.amountFen = amountFen
  qrPay.mode = 'link'
  qrPay.qrDataUrl = qrDataUrl
  qrPay.codeUrl = url
  qrPay.visible = true
  return true
}

const tabs = [
  { label: '全部', value: 'all' },
  { label: '待付款', value: 'new' },
  { label: '待接单', value: 'pending' },
  { label: '制作中', value: 'making' },
  { label: '配送中', value: 'delivering' },
  { label: '已完成', value: 'completed' },
  { label: '待评价', value: 'review' },
  { label: '退款/售后', value: 'refund' }
]

const activeTab = ref(route.query.tab || 'all')
const orders = ref([])
const loading = ref(true)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    orders.value = await getOrderList(activeTab.value)
    if (!orders.value) orders.value = []
  } catch (e) {
    orders.value = []
    loadError.value = (e && e.message) || '订单列表加载失败'
  } finally {
    loading.value = false
  }
}

function onTabChange(value) {
  activeTab.value = value
  load()
}

function goDetail(id) {
  router.push({ name: 'order-detail', params: { id } })
}

function goReview(id) {
  router.push({ name: 'review', params: { orderId: id } })
}

function repeatOrder(order) {
  if (!order || !order.items || !order.items.length) return
  order.items.forEach(item => {
    addToCart({
      id: item.id,
      name: item.name,
      subtitle: item.subtitle || '',
      image: item.image || '',
      price: item.price || 0,
      shopId: 'default',
      quantity: item.quantity || 1
    })
  })
  toast('已加入购物车')
  setTimeout(() => router.push({ name: 'cart' }), 300)
}

// 待付款订单：取消（真实后端落库）。acting 防重复点击
const actingId = ref('')
async function onCancel(order) {
  if (!order || actingId.value) return
  if (!window.confirm('确定取消这笔订单吗？')) return
  actingId.value = order.id
  try {
    await cancelOrder(order.id)
    toast('已取消')
    load()
  } catch (e) {
    toast((e && e.message) || '取消失败')
  } finally {
    actingId.value = ''
  }
}

// 待付款订单：重新拉起支付（手机微信 JSAPI / PC 走扫码）
async function onPay(order) {
  if (!order || actingId.value) return
  const openid = (store.userInfo && store.userInfo.openid) || ''
  // 只有**手机**微信能用 JSAPI；微信电脑版/普通浏览器一律走扫码
  const tradeType = isMobileWeChat() ? 'JSAPI' : 'NATIVE'
  actingId.value = order.id
  try {
    let pay
    try {
      pay = await payOrder({
        shopId: order.shopId || 'default',
        outTradeNo: order.id,
        amountFen: order.totalPrice || 0,
        description: '跳舞兰AI花店订单',
        openid,
        tradeType
      })
    } catch (e) {
      // PC：Native 权限未开通（NO_AUTH）→ 兜底成「手机支付页」二维码
      if (!isMobileWeChat() && /NO_AUTH|未开通|未授权/i.test(String((e && e.message) || ''))) {
        if (await openLinkQrPay(order.id, order.shopId || 'default', order.totalPrice || 0)) return
      }
      throw e
    }
    if (pay.tradeType === 'NATIVE') {
      // PC：弹二维码由手机扫码（结果交给面板回调）
      qrPay.outTradeNo = order.id
      qrPay.shopId = order.shopId || 'default'
      qrPay.amountFen = order.totalPrice || 0
      qrPay.mode = 'native'
      qrPay.qrDataUrl = pay.qrDataUrl || ''
      qrPay.codeUrl = pay.code_url || ''
      qrPay.visible = true
      return
    }
    if (pay.tradeType === 'H5' && pay.h5_url) {
      location.href = pay.h5_url
      return
    }
    if (pay.tradeType === 'JSAPI') {
      await invokeWxPay(pay)
      router.replace({ name: 'order-detail', params: { id: order.id } })
      return
    }
    toast('支付暂不可用，请稍后重试')
  } catch (e) {
    toast(payFailHint(e))
  } finally {
    actingId.value = ''
  }
}

// PC 扫码支付成功 → 刷新列表（订单状态由后端落库）
function onQrPaid() {
  qrPay.visible = false
  toast('支付成功')
  load()
}
function onQrClose() {
  qrPay.visible = false
}


const showRefund = ref(false)
const refundTarget = ref(null)
function openRefund(order) {
  refundTarget.value = order
  showRefund.value = true
}
function onRefundSuccess() {
  if (refundTarget.value) refundTarget.value.status = 'refunding'
  showRefund.value = false
  toast('已提交退款申请，商家处理中')
}

onMounted(load)
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(20);
}

/* 状态 Tab */
.order-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: #fff;
  border-bottom: rpx(1) solid var(--border-light);
  padding: rpx(12) rpx(18) rpx(10);
  row-gap: rpx(4);
}
.order-tab {
  text-align: center;
  padding: rpx(14) 0 rpx(16);
  font-size: var(--fs-body);
  color: var(--text-secondary);
  position: relative;
  white-space: nowrap;
}
.order-tab.active {
  color: var(--primary);
  font-weight: 600;
}
.order-tab.active::after {
  content: '';
  position: absolute;
  bottom: rpx(4);
  left: 50%;
  transform: translateX(-50%);
  width: rpx(48);
  height: rpx(4);
  background: var(--primary-gradient);
  border-radius: rpx(2);
}

/* 订单卡片 */
.order-list {
  padding: rpx(16) rpx(24);
}
.order-card {
  background: #fff;
  margin-bottom: rpx(16);
}
.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: rpx(16);
  border-bottom: rpx(1) solid var(--border-light);
}
.order-id {
  font-size: var(--fs-minor);
  color: var(--text-light);
}
.order-header-right {
  display: flex;
  align-items: center;
  gap: rpx(8);
  flex-shrink: 0;
}
.order-status {
  font-size: var(--fs-body);
  font-weight: 600;
}
.order-status.new,
.order-status.pending { color: #FF9500; }
.order-status.making { color: #4ECDC4; }
.order-status.delivering { color: #748FFC; }
.order-status.completed,
.order-status.cancelled,
.order-status.refunded,
.order-status.refund_failed { color: var(--text-light); }
.order-status.refunding { color: #FF9500; }

/* 商品 */
.order-goods {
  padding: rpx(16) 0;
}
.order-goods-item {
  display: flex;
  align-items: center;
  gap: rpx(12);
  padding: rpx(8) 0;
}
.order-goods-item + .order-goods-item {
  border-top: rpx(1) solid var(--border-light);
}
.order-goods-img {
  width: rpx(80);
  height: rpx(80);
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}
.order-goods-info {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}
.order-goods-title-wrap {
  flex: 1;
  min-width: 0;
}
.order-goods-name {
  font-size: var(--fs-body);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.order-goods-qty {
  font-size: var(--fs-minor);
  color: var(--text-light);
  flex-shrink: 0;
  margin-left: rpx(8);
}
.order-goods-price {
  flex-shrink: 0;
  margin-left: rpx(12);
}
.price-sm { font-size: var(--fs-body); }
.price-md { font-size: rpx(30); }

/* 底部 */
.order-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: rpx(16);
  border-top: rpx(1) solid var(--border-light);
}
.order-time {
  font-size: var(--fs-caption);
  color: var(--text-light);
}
.order-total {
  font-size: var(--fs-body);
  color: var(--text-secondary);
  display: flex;
  align-items: baseline;
  gap: rpx(4);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: rpx(120) 0;
}
.empty-icon {
  font-size: rpx(100);
}
.empty-text {
  margin-top: rpx(20);
  font-size: rpx(28);
  color: #999;
}
.empty-btn {
  margin-top: rpx(24);
}

/* 操作按钮 */
.order-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: rpx(16);
  padding-top: rpx(16);
  border-top: rpx(1) solid var(--border-light);
}
.order-refunding-tip {
  font-size: var(--fs-minor);
  color: #FF9500;
}

</style>
