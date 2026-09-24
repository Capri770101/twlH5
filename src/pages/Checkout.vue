<template>
  <div class="page">
    <NavBar title="确认订单" />

    <!-- 配送方式切换 -->
    <div class="section-card pickup-tabs-card">
      <div class="pickup-tabs">
        <div
          class="pickup-tab"
          :class="{ active: pickupMethod === 'delivery' }"
          @click="pickupMethod = 'delivery'"
        >送货上门</div>
        <div
          class="pickup-tab"
          :class="{ active: pickupMethod === 'pickup' }"
          @click="pickupMethod = 'pickup'"
        >到店自取</div>
      </div>
    </div>

    <!-- 收货地址（送货上门） -->
    <div v-if="pickupMethod === 'delivery'" class="section-card" @click="showAddr = true">
      <div class="address-section">
        <div class="address-header">
          <div class="address-info">
            <span class="address-name">{{ address.name }}</span>
            <span class="address-phone">{{ address.phone }}</span>
          </div>
        </div>
        <span class="address-detail">{{ addressFull }}</span>
        <span class="checkout-chevron">›</span>
      </div>
    </div>

    <!-- 自取店铺（到店自取） -->
    <div v-else class="section-card">
      <div class="pickup-shop">
        <div class="pickup-shop-header">
          <div class="pickup-shop-info">
            <span class="pickup-shop-name">{{ pickupShop.name }}</span>
            <span class="pickup-shop-addr">{{ pickupShop.address }}</span>
          </div>
        </div>
        <div class="pickup-contact-block">
          <div class="pickup-contact-row">
            <span class="pickup-contact-label">取货人</span>
            <input v-model="pickupContactName" class="pickup-contact-input" placeholder="请输入姓名" maxlength="20" />
          </div>
          <div class="pickup-contact-row">
            <span class="pickup-contact-label">手机号</span>
            <input v-model="pickupContactPhone" class="pickup-contact-input" type="tel" placeholder="请输入手机号码" maxlength="11" />
          </div>
        </div>
        <div class="pickup-time-row" @click="openTime('pickup')">
          <span class="option-label">取货时间</span>
          <div class="option-value">
            <span>{{ pickupTime || '请选择取货时间' }}</span>
            <span class="option-arrow">›</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 配送时间（送货上门） -->
    <div v-if="pickupMethod === 'delivery'" class="section-card" @click="openTime('delivery')">
      <div class="option-row">
        <span class="option-label">配送时间</span>
        <div class="option-value">
          <span>{{ deliveryTime || '请选择配送时间' }}</span>
          <span class="option-arrow">›</span>
        </div>
      </div>
    </div>

    <!-- 商品清单 -->
    <div v-if="groupedCart.length" class="section-card">
      <div v-for="group in groupedCart" :key="group.shopId" class="shop-group">
        <div class="shop-header">
          <span class="shop-name">{{ group.shopName }}</span>
        </div>
        <div v-for="product in group.items" :key="product.id + '|' + (product.specId || '')" class="goods-item">
          <div class="goods-img">
            <FlowerImage :src="product.image" emoji="💐" />
          </div>
          <div class="goods-info">
            <span class="goods-name">{{ product.name }}</span>
            <div v-if="product.specName || product.subtitle" class="goods-specs">
              <span v-if="product.specName" class="goods-spec-chip">{{ product.specName }}</span>
              <span v-if="product.subtitle">{{ product.subtitle }}</span>
            </div>
            <div class="goods-price-row">
              <span class="price price-sm">{{ money(product.price) }}</span>
              <div class="quantity-stepper">
                <div
                  class="quantity-stepper-btn"
                  :class="{ disabled: product.quantity <= 1 }"
                  @click.stop="changeQuantity(product.id, product.shopId, -1, product.specId)"
                >-</div>
                <span class="quantity-stepper-value">{{ product.quantity }}</span>
                <div class="quantity-stepper-btn" @click.stop="changeQuantity(product.id, product.shopId, 1, product.specId)">+</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 贺卡 -->
    <div class="section-card">
      <div class="card-header" @click="needCard = !needCard">
        <span class="card-title">是否需要贺卡</span>
        <div class="card-toggle-right">
          <span class="card-toggle-text">需要</span>
          <div class="card-radio" :class="{ active: needCard }">
            <span v-if="needCard" class="card-radio-icon">✓</span>
          </div>
        </div>
      </div>

      <div v-if="needCard">
        <div class="card-type-row">
          <div class="card-type-btn active">AI 贺卡</div>
        </div>

        <div class="saved-greetings">
          <GreetingEditor
            :plan="{}"
            :default-open="false"
            summary-text="现场生成一张 AI 贺卡"
            @ready="onGreetingReady"
          />
          <img v-if="cardImageUrl" class="selected-greeting-image" :src="cardImageUrl" alt="所选贺卡预览" />
          <div v-if="savedGreetings.length" class="saved-greeting-list">
            <div
              v-for="g in savedGreetings"
              :key="g.id"
              class="saved-greeting"
              :class="{ active: selectedGreetingId === g.id }"
            >
              <button type="button" class="greeting-body" @click="useGreeting(g)">
                <img v-if="g.imageUrl" :src="g.imageUrl" alt="" />
                <span>{{ g.text }}</span>
              </button>
              <button type="button" class="greeting-delete" @click="deleteGreeting(g)">✕</button>
            </div>
          </div>
          <div v-else class="saved-greeting-empty">在上方生成一张 AI 贺卡，或登录后选择已保存的贺卡。</div>
        </div>

        <div class="order-card-list">
          <div v-for="(card, index) in cardDrafts" :key="card.localId" class="order-card-item">
            <div class="order-card-item-head">
              <b>贺卡 {{ index + 1 }}</b>
              <button type="button" class="card-remove" @click="removeCardDraft(index)">删除</button>
            </div>
            <div class="order-card-bind">
              <span>对应商品</span>
              <select v-model="card.itemId">
                <option v-for="item in checkoutItems" :key="item.id" :value="item.id">{{ item.name }}</option>
              </select>
            </div>
            <img v-if="card.image_url" class="order-card-thumb" :src="card.image_url" alt="贺卡预览" />
            <div class="order-card-summary">{{ card.text || '（无正文）' }}</div>
          </div>
          <button v-if="cardDrafts.length < 5" type="button" class="add-card-btn" @click="addCurrentCard">＋ 添加当前贺卡</button>
          <p class="card-limit-tip">每笔订单最多 5 张贺卡，可删除或重新调整对应商品。</p>
        </div>
      </div>
    </div>

    <!-- 备注 -->
    <div class="section-card">
      <div class="remark-row">
        <span class="remark-label">备注</span>
        <input v-model="remark" class="remark-input" placeholder="如有特殊需求请填写（选填）" />
      </div>
    </div>

    <!-- 费用明细 -->
    <div class="section-card">
      <span class="section-title">费用明细</span>
      <div class="fee-row">
        <span class="fee-label">商品合计</span>
        <span class="fee-value price price-sm">{{ money(goodsTotalPrice) }}</span>
      </div>
      <div v-if="discountAmount > 0" class="fee-row discount-row">
        <span class="fee-label">满减优惠</span>
        <span class="fee-value discount-value">-¥{{ money(discountAmount) }}</span>
      </div>
      <div class="fee-row">
        <span class="fee-label">配送费</span>
        <span class="fee-value" style="color: var(--secondary);">
          {{ pickupMethod === 'pickup' ? '免配送费（自取）' : '免配送费' }}
        </span>
      </div>
      <div class="fee-row fee-total">
        <span class="fee-label">实付金额</span>
        <span class="fee-value price price-lg">{{ money(payAmount) }}</span>
      </div>
    </div>

    <div class="footer-placeholder"></div>

    <!-- 底部提交 -->
    <div class="checkout-footer">
      <div class="checkout-total">
        <span class="checkout-total-label">合计：</span>
        <span class="price price-xl">{{ money(payAmount) }}</span>
      </div>
      <button class="btn btn-primary btn-lg" :class="{ 'btn-disabled': !canSubmit }" @click="onSubmit">
        {{ submitting ? '处理中...' : '提交订单' }}
      </button>
    </div>

    <!-- 时间选择弹窗 -->
    <div v-if="showTime" class="modal-mask" @click="showTime = false"></div>
    <div v-if="showTime" class="modal-content modal-time-picker">
      <div class="modal-header">
        <span class="modal-title">{{ timeModalTitle }}</span>
        <span class="modal-close" @click="showTime = false">✕</span>
      </div>

      <div class="picker-columns">
        <div class="picker-date-col">
          <div
            v-for="(d, i) in dates"
            :key="d.dateLabel"
            class="picker-date-item"
            :class="{ active: selectedDateIndex === i }"
            @click="selectedDateIndex = i"
          >{{ d.dateLabel }}</div>
          <div class="picker-scroll-spacer"></div>
        </div>
        <div class="picker-slot-col">
          <div
            v-for="slot in dates[selectedDateIndex].slots"
            :key="slot.fullText"
            class="picker-slot-item"
            :class="{ active: pendingTime === slot.fullText }"
            @click="pendingTime = slot.fullText"
          >
            <span>{{ slot.timeSlot }}</span>
            <span v-if="pendingTime === slot.fullText" class="picker-check">✓</span>
          </div>
          <div class="picker-scroll-spacer"></div>
        </div>
      </div>

      <div class="picker-footer">
        <button class="btn btn-primary btn-lg" @click="confirmTime">确认选择</button>
      </div>
    </div>

  </div>
  <AddressManager v-model="showAddr" />

  <!-- PC 扫码支付面板（非微信环境下单后弹出；手机扫码付） -->
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
import { ref, reactive, computed, onUnmounted, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createOrder, getDeliveryDates, payOrder, listSavedGreetings, deleteSavedGreeting } from '@/mock/api'
import GreetingEditor from '@/components/GreetingEditor.vue'
import {
  groupedCart,
  totalPrice as cartTotal,
  changeQuantity,
  clearCart,
  money
} from '@/store'
import store from '@/store'
import { isMobileWeChat, invokeWxPay, payFailHint } from '@/utils/wxpay'
import { linkQrDataUrl, mobilePayUrl } from '@/utils/qr'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import AddressManager from '@/components/AddressManager.vue'
import QrPayPanel from '@/components/QrPayPanel.vue'
import { toast } from '@/utils/toast'

const router = useRouter()

// PC 扫码支付（Native）面板状态：只有非手机微信才会用到
const qrPay = reactive({
  visible: false,
  outTradeNo: '',
  shopId: '',
  amountFen: 0,
  mode: 'native', // native=微信支付码 / link=兜底（二维码指向手机支付页）
  qrDataUrl: '',
  codeUrl: ''
})
/**
 * PC 兜底通道：把二维码指向「手机支付页」（/login?redirect=/pay/xxx）。
 * 用户手机微信扫码 → 自动授权登录 → 在手机上点确认支付（JSAPI）→ PC 轮询到已支付自动跳转。
 * 好处：完全不需要开通 Native / H5支付 权限。
 */
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
// 扫码支付成功：此时才清购物车并进订单详情
function onQrPaid() {
  const id = qrPay.outTradeNo
  qrPay.visible = false
  clearCart()
  toast('支付成功')
  router.replace({ name: 'order-detail', params: { id } })
}
// 取消 / 二维码失效：订单已创建，引导去订单页稍后支付
function onQrClose() {
  const id = qrPay.outTradeNo
  qrPay.visible = false
  if (!id) return
  clearCart()
  toast('订单已创建，可稍后在订单页完成支付')
  router.replace({ name: 'order-detail', params: { id } })
}

const pickupMethod = ref('delivery')
const address = computed(() => store.selectedAddress || { name: '', phone: '', detail: '请选择收货地址' })
// 完整地址展示：优先 full，其次「省市区 + 详细」（旧数据只有 detail 时也不会空白）
const addressFull = computed(() => {
  const a = store.selectedAddress
  if (!a) return '请选择收货地址'
  const region = a.region || [a.province, a.city, a.district].filter(Boolean).join('')
  return a.full || ((region || '') + (a.detail || ''))
})
const showAddr = ref(false)
const pickupShop = ref({ name: '盐田花语鲜花店', address: '深圳市盐田区海山路18号' })
const pickupContactName = ref('')
const pickupContactPhone = ref('')

const deliveryTime = ref('')
const pickupTime = ref('')

const needCard = ref(false)
const cardMessage = ref('')
const cardTargetName = ref('')
const cardMyName = ref('')
const cardScene = ref('')
const cardImageUrl = ref('')
const cardTemplate = ref('')
const savedGreetings = ref([])
const selectedGreetingId = ref('')
let renderedGreeting = null
const cardDrafts = ref([])
const checkoutItems = computed(() => groupedCart.value.flatMap(g => g.items))

const remark = ref('')
const submitting = ref(false)

const showTime = ref(false)
const timeKind = ref('delivery')
const dates = getDeliveryDates()
const selectedDateIndex = ref(0)
const pendingTime = ref('')

const goodsTotalPrice = computed(() => cartTotal.value)
// 满减规则：与后端 server/src/orders.js::fullReduction 及小程序
// /opt/flower-shop/server.js::calcFullReduction 三处必须完全一致（单位：分）
const discountAmount = computed(() => {
  const t = goodsTotalPrice.value
  if (t >= 30000) return 3000
  if (t >= 20000) return 2000
  if (t >= 10000) return 1000
  return 0
})
const payAmount = computed(() => goodsTotalPrice.value - discountAmount.value)

const canSubmit = computed(() => {
  if (!groupedCart.value.length || submitting.value) return false
  if (pickupMethod.value === 'delivery') return !!deliveryTime.value && !!store.selectedAddress
  // 自取：姓名非空 + 手机号格式校验（原先只判非空，填错也能提交）
  return !!pickupContactName.value
    && /^1[3-9]\d{9}$/.test(String(pickupContactPhone.value || '').trim())
    && !!pickupTime.value
})

const timeModalTitle = computed(() =>
  timeKind.value === 'delivery' ? '选择预计送达时间' : '选择取货时间'
)

const cardFinalContent = computed(() => {
  if (!cardMessage.value) return ''
  const to = cardTargetName.value ? `To ${cardTargetName.value}\n` : ''
  const from = cardMyName.value ? `\nFrom ${cardMyName.value}` : ''
  return to + cardMessage.value + from
})

try {
  const pending = JSON.parse(sessionStorage.getItem('twd_pending_greeting') || 'null')
  if (pending && pending.text) {
    needCard.value = true
    cardMessage.value = String(pending.text || '')
    cardTargetName.value = String(pending.recipient || '')
    cardMyName.value = String(pending.sender || '')
    cardScene.value = String(pending.occasion || '')
    cardImageUrl.value = String(pending.imageUrl || '')
    cardTemplate.value = String(pending.template || '')
    renderedGreeting = { text: cardMessage.value, recipient: cardTargetName.value, sender: cardMyName.value, occasion: cardScene.value }
    sessionStorage.removeItem('twd_pending_greeting')
  }
} catch (e) { /* ignore malformed pending greeting */ }

function useGreeting(g) {
  if (!g) return
  selectedGreetingId.value = g.id || ''
  cardMessage.value = g.text || ''
  cardTargetName.value = g.recipient || ''
  cardMyName.value = g.sender || ''
  cardScene.value = g.occasion || ''
  cardImageUrl.value = g.imageUrl || ''
  cardTemplate.value = g.template || ''
  renderedGreeting = { text: cardMessage.value, recipient: cardTargetName.value, sender: cardMyName.value, occasion: cardScene.value }
}

// 结算页内嵌编辑器「使用这张贺卡」→ 直接填进当前贺卡，无需跳回对话页
function onGreetingReady(g) {
  if (!g) return
  needCard.value = true
  selectedGreetingId.value = ''
  cardMessage.value = g.text || ''
  cardTargetName.value = g.recipient || ''
  cardMyName.value = g.sender || ''
  cardScene.value = g.occasion || ''
  cardImageUrl.value = g.imageUrl || ''
  cardTemplate.value = g.template || ''
  renderedGreeting = { text: cardMessage.value, recipient: cardTargetName.value, sender: cardMyName.value, occasion: cardScene.value }
}

async function deleteGreeting(g) {
  if (!g || !g.id) return
  try {
    await deleteSavedGreeting(g.id)
    savedGreetings.value = savedGreetings.value.filter(x => x.id !== g.id)
    if (selectedGreetingId.value === g.id) {
      selectedGreetingId.value = ''
      cardImageUrl.value = ''
    }
    toast('已删除贺卡')
  } catch (e) {
    toast((e && e.message) || '删除失败，请稍后重试')
  }
}

function currentCardSnapshot() {
  return {
    localId: 'card_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    enabled: true,
    type: 'ai_generated',
    text: cardFinalContent.value,
    image_url: cardImageUrl.value,
    template: cardTemplate.value,
    recipient: cardTargetName.value,
    sender: cardMyName.value,
    occasion: cardScene.value,
    itemId: checkoutItems.value[0]?.id || ''
  }
}

function addCurrentCard() {
  if (cardDrafts.value.length >= 5) { toast('每笔订单最多 5 张贺卡'); return }
  const card = currentCardSnapshot()
  if (!card.image_url) { toast('请先生成或选择一张 AI 贺卡'); return }
  if (cardDrafts.value.some(x => x.text === card.text && x.image_url === card.image_url)) {
    toast('这张贺卡已经添加')
    return
  }
  cardDrafts.value.push(card)
  toast('贺卡已加入订单')
}

function removeCardDraft(index) {
  cardDrafts.value.splice(index, 1)
  if (!cardDrafts.value.length) needCard.value = false
}

watch([cardMessage, cardTargetName, cardMyName, cardScene], () => {
  if (renderedGreeting && (
    cardMessage.value !== renderedGreeting.text || cardTargetName.value !== renderedGreeting.recipient ||
    cardMyName.value !== renderedGreeting.sender || cardScene.value !== renderedGreeting.occasion
  )) {
    cardImageUrl.value = ''
    selectedGreetingId.value = ''
    renderedGreeting = null
  }
})

onMounted(async () => {
  if (!store.isLogged) return
  try {
    savedGreetings.value = await listSavedGreetings()
  } catch (e) {
    console.warn('[checkout] 贺卡读取失败：', e && e.message)
  }
})

function openTime(kind) {
  timeKind.value = kind
  pendingTime.value = kind === 'delivery' ? deliveryTime.value : pickupTime.value
  showTime.value = true
}

function confirmTime() {
  if (!pendingTime.value) {
    toast('请选择时间')
    return
  }
  if (timeKind.value === 'delivery') deliveryTime.value = pendingTime.value
  else pickupTime.value = pendingTime.value
  showTime.value = false
}

async function onSubmit() {
  if (submitting.value) return // 防重复点击
  if (!canSubmit.value) {
    toast(pickupMethod.value === 'delivery' ? '请选择配送时间' : '请填写取货人信息')
    return
  }
  submitting.value = true
  try {
    // 规格信息并入 subtitle 快照（后端 order_items 无独立 spec 列）
    const items = groupedCart.value.flatMap(g => g.items).map(it => ({
      ...it,
      subtitle: [it.specName, it.subtitle].filter(Boolean).join(' · ')
    }))
    const firstShop = groupedCart.value[0] || {}
    // ⚠️ 修复：createOrder 原先在 try 之外，创建失败时 submitting 永远 true → 按钮永久卡在「处理中…」
    const res = await createOrder({
      shopId: firstShop.shopId || 'default',
      shopName: firstShop.shopName || '',
      items,
      totalPrice: payAmount.value,
      address: store.selectedAddress,
      expectDeliveryTime: pickupMethod.value === 'delivery' ? deliveryTime.value : pickupTime.value,
      pickupMethod: pickupMethod.value,
      pickupName: pickupContactName.value,
      pickupPhone: pickupContactPhone.value,
      cardContent: needCard.value
        ? (cardDrafts.value[0]?.text || cardFinalContent.value)
        : '',
      card: (() => {
        const cards = needCard.value
          ? (cardDrafts.value.length ? cardDrafts.value : [currentCardSnapshot()])
          : []
        return cards.length ? { enabled: true, cards: cards.slice(0, 5) } : null
      })(),
      remark: remark.value
    })
    const outTradeNo = res.id
    const shopId = (groupedCart.value[0] && groupedCart.value[0].shopId) || 'default'
    const amountFen = payAmount.value
    // 通道：微信内 JSAPI（WeixinJSBridge 拉起）；PC/外部浏览器走 Native 扫码
    // （MWEB 面向手机浏览器、桌面体验差；Native 才是 PC 的标准做法）
    // 只有**手机**微信能用 JSAPI；微信电脑版/普通浏览器一律走 Native 扫码
    const tradeType = isMobileWeChat() ? 'JSAPI' : 'NATIVE'
    const openid = (store.userInfo && store.userInfo.openid) || ''
    try {
      let pay
      try {
        pay = await payOrder({ shopId, outTradeNo, amountFen, description: '跳舞兰AI花店订单', openid, tradeType })
      } catch (e) {
        // PC：Native 支付权限未开通（NO_AUTH）→ 兜底成「手机支付页」二维码。
        // 用户手机微信扫码打开支付页，用手机内的 JSAPI 付款（JSAPI 权限本来就有）。
        if (!isMobileWeChat() && /NO_AUTH|未开通|未授权/i.test(String((e && e.message) || ''))) {
          if (await openLinkQrPay(outTradeNo, shopId, amountFen)) return
        }
        throw e
      }
      if (pay.tradeType === 'NATIVE') {
        // PC：弹二维码由手机扫码。此处**不清购物车、不跳转** —— 结果交给面板回调，
        // 否则用户扫了码没付成、购物车却已空。
        qrPay.outTradeNo = outTradeNo
        qrPay.shopId = shopId
        qrPay.amountFen = amountFen
        qrPay.mode = 'native'
        qrPay.qrDataUrl = pay.qrDataUrl || ''
        qrPay.codeUrl = pay.code_url || ''
        qrPay.visible = true
        return
      }
      if (pay.tradeType === 'H5' && pay.h5_url) {
        clearCart()
        location.href = pay.h5_url // 跳微信 App 收银台（外部浏览器）
        return
      }
      if (pay.tradeType === 'JSAPI') {
        await invokeWxPay(pay) // 微信内拉起收银台
      }
      clearCart()
      router.replace({ name: 'order-detail', params: { id: outTradeNo } })
    } catch (e) {
      // 支付未调起：订单已建，按失败原因给出可执行的指引（环境不支持 / 权限未开通 各不相同）
      clearCart()
      toast(payFailHint(e))
      router.replace({ name: 'order-detail', params: { id: outTradeNo } })
    }
  } catch (e) {
    toast((e && e.message) || '下单失败，请重试')
  } finally {
    submitting.value = false // 无论成功失败都解锁按钮
  }
}


</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f7f5f2;
  padding-bottom: rpx(140);
}

.section-card {
  background: #fff;
  margin: 0 0 rpx(16);
  padding: rpx(28) rpx(38);
  box-sizing: border-box;
  border-bottom: rpx(1) solid #f0ebe7;
}
.section-title {
  font-size: rpx(28);
  font-weight: 600;
  color: #251f1c;
  margin-bottom: rpx(16);
  display: block;
}

/* 配送方式 */
.pickup-tabs-card {
  margin-top: rpx(-6);
  padding: rpx(22) rpx(30);
}
.pickup-tabs {
  display: flex;
  background: #f7f5f2;
  border-radius: rpx(12);
  padding: rpx(6);
}
.pickup-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: rpx(20) 0;
  font-size: rpx(28);
  color: #8d827c;
  border-radius: rpx(10);
  transition: all 0.2s;
}
.pickup-tab.active {
  background: #fff;
  color: #e8615d;
  font-weight: 600;
  box-shadow: 0 rpx(4) rpx(12) rgba(78, 57, 46, 0.08);
}

/* 自取店铺 */
.pickup-shop-header {
  display: flex;
  align-items: flex-start;
  gap: rpx(12);
  margin-bottom: rpx(20);
}
.pickup-shop-info {
  display: flex;
  flex-direction: column;
  gap: rpx(6);
}
.pickup-shop-name {
  font-size: rpx(30);
  font-weight: 600;
}
.pickup-shop-addr {
  font-size: var(--fs-minor);
  color: #8d827c;
  line-height: 1.5;
}
.pickup-contact-block {
  border-top: rpx(1) solid #f0ebe7;
}
.pickup-contact-row {
  min-height: rpx(84);
  display: flex;
  align-items: center;
  gap: rpx(20);
}
.pickup-contact-row + .pickup-contact-row {
  border-top: rpx(1) solid #f5f1ee;
}
.pickup-contact-label {
  width: rpx(112);
  flex-shrink: 0;
  color: #251f1c;
  font-size: rpx(27);
}
.pickup-contact-input {
  flex: 1;
  min-width: 0;
  color: #251f1c;
  font-size: rpx(27);
  text-align: right;
  border: none;
  background: transparent;
  outline: none;
}
.pickup-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: rpx(84);
  border-top: rpx(1) solid #f0f0f0;
}

/* 地址 */
.address-section {
  position: relative;
  padding-right: rpx(38);
}
.address-header {
  display: flex;
  align-items: center;
  gap: rpx(12);
  margin-bottom: rpx(8);
}
.address-info {
  display: flex;
  align-items: center;
  gap: rpx(16);
}
.address-name {
  font-size: rpx(30);
  font-weight: 600;
}
.address-phone {
  font-size: var(--fs-body);
  color: #6f6660;
}
.address-detail {
  font-size: var(--fs-body);
  color: #6f6660;
  line-height: 1.5;
}
.checkout-chevron {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  flex-shrink: 0;
  color: #b7afaa;
  font-size: rpx(38);
  line-height: 1;
}

/* 配送时间 */
.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.option-label {
  font-size: rpx(28);
  color: #251f1c;
}
.option-value {
  display: flex;
  align-items: center;
  gap: rpx(8);
  font-size: var(--fs-body);
  color: var(--text-secondary);
}
.option-arrow {
  color: #b7afaa;
  font-size: rpx(34);
  line-height: 1;
}

/* 商品清单 */
.shop-header {
  display: flex;
  align-items: center;
  gap: rpx(8);
  padding-bottom: rpx(16);
  margin-bottom: rpx(4);
}
.shop-name {
  font-size: rpx(28);
  font-weight: 600;
  color: #251f1c;
}
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
  font-weight: 500;
}
.goods-specs {
  font-size: var(--fs-minor);
  color: #8d827c;
  background: #f7f5f2;
  display: inline-flex;
  align-items: center;
  gap: rpx(8);
  align-self: flex-start;
  padding: rpx(2) rpx(12);
  border-radius: rpx(4);
}
.goods-spec-chip {
  color: var(--primary);
  font-weight: 600;
}
.goods-spec-chip + span::before {
  content: '·';
  margin-right: rpx(8);
  color: #c9c0ba;
}
.goods-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.quantity-stepper {
  flex-shrink: 0;
  height: rpx(48);
  display: grid;
  grid-template-columns: rpx(48) rpx(46) rpx(48);
  align-items: center;
  border: rpx(1) solid #ded8d3;
  border-radius: rpx(8);
  overflow: hidden;
  background: #fff;
}
.quantity-stepper-btn {
  width: rpx(48);
  height: rpx(48);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #251f1c;
  font-size: rpx(32);
  line-height: 1;
}
.quantity-stepper-btn.disabled {
  color: #c9c3bf;
  background: #faf9f8;
}
.quantity-stepper-value {
  height: rpx(48);
  border-left: rpx(1) solid #eee9e5;
  border-right: rpx(1) solid #eee9e5;
  color: #251f1c;
  font-size: var(--fs-minor);
  line-height: rpx(48);
  text-align: center;
}

/* 贺卡 */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-size: rpx(28);
  color: #251f1c;
  font-weight: 600;
}
.card-toggle-right {
  display: flex;
  align-items: center;
  gap: rpx(12);
}
.card-toggle-text {
  font-size: rpx(28);
  color: #333;
}
.card-radio {
  width: rpx(40);
  height: rpx(40);
  border: rpx(2) solid #ccc;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}
.card-radio.active {
  border-color: var(--primary);
  background: var(--primary);
}
.card-radio-icon {
  color: #fff;
  font-size: var(--fs-minor);
  line-height: 1;
}
.card-type-row {
  display: flex;
  gap: rpx(16);
  margin-top: rpx(20);
}
.card-type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: rpx(18) 0;
  border-radius: rpx(12);
  border: rpx(2) solid #eee;
  font-size: var(--fs-body);
  color: #666;
  transition: all 0.2s;
}
.card-type-btn.active {
  border-color: var(--primary);
  color: var(--primary);
  background: #fffaf5;
  font-weight: 500;
}

/* 备注 */
.remark-row {
  display: flex;
  align-items: center;
  gap: rpx(16);
}
.remark-label {
  font-size: rpx(28);
  color: #251f1c;
  flex-shrink: 0;
}
.remark-input {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-body);
  border: none;
  background: transparent;
  outline: none;
}

/* 费用 */
.fee-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: rpx(10) 0;
}
.fee-row + .fee-row {
  border-top: rpx(1) solid var(--border-light);
}
.fee-label {
  font-size: var(--fs-body);
  color: var(--text-secondary);
}
.fee-value {
  font-size: var(--fs-body);
}
.discount-row .fee-label,
.discount-value {
  color: #e8615d;
}
.discount-value {
  font-size: rpx(28);
  font-weight: 600;
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
.price-sm { font-size: rpx(28); }
.price-lg { font-size: rpx(36); }
.price-xl { font-size: rpx(40); }

.footer-placeholder {
  height: rpx(40);
}

/* 底部提交 */
.checkout-footer {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: rpx(18) rpx(38);
  background: #fff;
  box-shadow: 0 rpx(-2) rpx(16) rgba(0, 0, 0, 0.04);
  padding-bottom: calc(#{rpx(16)} + env(safe-area-inset-bottom));
  z-index: 100;
}
.checkout-total {
  display: flex;
  align-items: baseline;
  gap: rpx(4);
}
.checkout-total-label {
  font-size: rpx(28);
  color: var(--text-secondary);
}

/* 时间选择弹窗 */
.modal-time-picker {
  left: 50%;
  transform: translateX(-50%);
  width: 1rem;
  height: 78vh;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 0;
  box-sizing: border-box;
}
.picker-columns {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.picker-date-col {
  width: rpx(260);
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  background: #fafafa;
  border-right: rpx(1) solid #eee;
  box-sizing: border-box;
}
.picker-date-item {
  padding: rpx(24) rpx(20);
  font-size: rpx(28);
  color: #333;
  text-align: center;
  border-bottom: rpx(1) solid #f0f0f0;
  position: relative;
}
.picker-date-item.active {
  background: #fff;
  color: var(--primary);
  font-weight: 600;
}
.picker-date-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: rpx(6);
  height: rpx(36);
  background: var(--primary);
  border-radius: 0 rpx(4) rpx(4) 0;
}
.picker-slot-col {
  flex: 1;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
  background: #fff;
  box-sizing: border-box;
}
.picker-slot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: rpx(28) rpx(32);
  font-size: rpx(30);
  color: #666;
  border-bottom: rpx(1) solid #f5f5f5;
}
.picker-slot-item.active {
  color: var(--primary);
  font-weight: 600;
  background: #fff8f0;
}
.picker-check {
  color: var(--primary);
  font-weight: 700;
}
.picker-footer {
  flex-shrink: 0;
  padding: rpx(16) rpx(24) calc(#{rpx(16)} + env(safe-area-inset-bottom));
  border-top: rpx(1) solid #f0f0f0;
  background: #fff;
}
.picker-scroll-spacer {
  height: rpx(32);
}

</style>
