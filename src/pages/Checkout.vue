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
          <div
            class="card-type-btn"
            :class="{ active: cardType === 'blank' }"
            @click="cardType = 'blank'"
          >空白贺卡</div>
          <div
            class="card-type-btn"
            :class="{ active: cardType === 'write' }"
            @click="cardType = 'write'"
          >商家代写</div>
        </div>

        <div v-if="cardFinalContent" class="card-final-preview">
          <div class="card-final-header">
            <span class="card-final-title">贺卡内容</span>
            <span class="card-final-edit" @click="showCardWrite = true">修改</span>
          </div>
          <div class="card-final-body">
            <span class="card-final-text">{{ cardFinalContent }}</span>
          </div>
        </div>
        <div v-else-if="cardType === 'write'" class="card-write-entry" @click="showCardWrite = true">
          <span>写下你的祝福语 ›</span>
        </div>

        <div v-if="cardType === 'write'" class="card-phone-row">
          <span class="card-phone-label">您的电话<span class="card-help-icon">?</span></span>
          <span class="card-phone-area">+86 ▼</span>
          <input v-model="cardPhone" class="card-phone-input" placeholder="请输入手机号" type="tel" maxlength="11" />
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

    <!-- 贺卡代写弹窗 -->
    <div v-if="showCardWrite" class="modal-mask" @click="showCardWrite = false"></div>
    <div v-if="showCardWrite" class="modal-content modal-card-write">
      <div class="modal-header">
        <span class="modal-title">填写祝福语</span>
        <span class="modal-close" @click="showCardWrite = false">✕</span>
      </div>

      <div class="card-paper">
        <div v-if="cardMessage.length" class="card-clear-area">
          <span class="card-clear-btn" @click="cardMessage = ''">清空</span>
        </div>
        <input v-model="cardTargetName" class="card-nickname-input" placeholder="TA的昵称（选填）" />
        <textarea
          v-model="cardMessage"
          class="card-textarea"
          maxlength="50"
          placeholder="请写下祝福语，如未填写，灰色文字和虚线不会打印在贺卡上"
        ></textarea>
        <div class="card-char-count">{{ cardMessage.length }}/50</div>
        <input v-model="cardMyName" class="card-myname-input" placeholder="您的昵称（选填）" />
      </div>

      <div class="card-scene-scroll hide-scrollbar">
        <span
          v-for="s in cardSceneTags"
          :key="s"
          class="card-scene-tag"
          :class="{ active: cardScene === s }"
          @click="cardScene = s"
        >{{ s }}</span>
      </div>

      <div class="card-suggestion-head">
        <span class="card-suggestion-title">祝福语灵感</span>
        <span class="card-refresh-btn" @click="refreshSuggestions">换一批</span>
      </div>
      <div class="card-ai-list">
        <div
          v-for="item in aiSuggestions"
          :key="item"
          class="card-ai-item"
          :class="{ selected: cardMessage === item }"
          @click="cardMessage = item"
        >
          <span class="card-ai-label">真诚</span>
          <span class="card-ai-text">{{ item }}</span>
        </div>
      </div>

      <div class="picker-footer">
        <button class="btn btn-primary btn-lg" :class="{ 'btn-disabled': !cardMessage }" @click="confirmCard">
          确认并提交
        </button>
      </div>
    </div>

  </div>
  <AddressManager v-model="showAddr" />

</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { createOrder, getDeliveryDates, payOrder } from '@/mock/api'
import {
  groupedCart,
  totalPrice as cartTotal,
  changeQuantity,
  clearCart,
  money
} from '@/store'
import store from '@/store'
import { isWeChat, invokeWxPay } from '@/utils/wxpay'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import AddressManager from '@/components/AddressManager.vue'
import { toast } from '@/utils/toast'

const router = useRouter()

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
const cardType = ref('blank')
const cardMessage = ref('')
const cardTargetName = ref('')
const cardMyName = ref('')
const cardPhone = ref('')
const cardScene = ref('')
const showCardWrite = ref(false)

const remark = ref('')
const submitting = ref(false)

const showTime = ref(false)
const timeKind = ref('delivery')
const dates = getDeliveryDates()
const selectedDateIndex = ref(0)
const pendingTime = ref('')

const goodsTotalPrice = computed(() => cartTotal.value)
const discountAmount = computed(() => (goodsTotalPrice.value >= 20000 ? 2000 : 0))
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

const cardSceneTags = ['生日', '表白', '感谢', '道歉', '祝福', '探望']
const suggestionPool = [
  ['愿这束花替我说出想说的话', '谢谢你一直在我身边', '愿你的每一天都像花儿一样灿烂'],
  ['所有的美好都如期而至', '想把春天送给你', '你值得这世间所有的温柔'],
  ['见花如见人，愿你欢喜', '花开正好，恰如初见', '愿生活对你温柔以待']
]
const aiSuggestions = ref(suggestionPool[0])
let suggestIdx = 0
function refreshSuggestions() {
  suggestIdx = (suggestIdx + 1) % suggestionPool.length
  aiSuggestions.value = suggestionPool[suggestIdx]
}

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

function confirmCard() {
  if (!cardMessage.value) return
  showCardWrite.value = false
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
      cardContent: cardFinalContent.value,
      remark: remark.value
    })
    const outTradeNo = res.id
    const shopId = (groupedCart.value[0] && groupedCart.value[0].shopId) || 'default'
    const amountFen = payAmount.value
    const tradeType = isWeChat() ? 'JSAPI' : 'H5'
    const openid = (store.userInfo && store.userInfo.openid) || ''
    try {
      const pay = await payOrder({ shopId, outTradeNo, amountFen, description: '跳舞兰AI花店订单', openid, tradeType })
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
      // 支付未调起（如微信内缺 openid）：订单已建，引导去订单页稍后支付
      clearCart()
      toast('订单已创建，可稍后在订单页完成支付')
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
.card-write-entry {
  margin-top: rpx(20);
  padding: rpx(24);
  border: rpx(1) dashed #e3d5cc;
  border-radius: rpx(12);
  text-align: center;
  color: var(--primary);
  font-size: rpx(26);
}
.card-phone-row {
  display: flex;
  align-items: center;
  gap: rpx(16);
  margin-top: rpx(20);
  padding-top: rpx(16);
  border-top: rpx(1) solid #f5f5f5;
}
.card-phone-label {
  font-size: var(--fs-body);
  color: var(--text-primary);
  white-space: nowrap;
}
.card-help-icon {
  display: inline-block;
  width: rpx(32);
  height: rpx(32);
  line-height: rpx(30);
  text-align: center;
  border: rpx(1) solid #ccc;
  border-radius: 50%;
  font-size: var(--fs-label);
  color: #999;
  margin-left: rpx(4);
  vertical-align: middle;
}
.card-phone-area {
  font-size: var(--fs-minor);
  color: #666;
  white-space: nowrap;
}
.card-phone-input {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-body);
  text-align: right;
  border: none;
  background: transparent;
  outline: none;
}
.card-final-preview {
  margin-top: rpx(20);
  border-radius: rpx(12);
  overflow: hidden;
  border: rpx(1) solid #f0e6e0;
}
.card-final-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: rpx(16) rpx(20);
  background: #fdf8f4;
  border-bottom: rpx(1) solid #f0e6e0;
}
.card-final-title {
  font-size: var(--fs-body);
  color: var(--primary);
  font-weight: 500;
}
.card-final-edit {
  font-size: var(--fs-minor);
  color: var(--primary);
  border: rpx(1) solid var(--primary);
  border-radius: rpx(6);
  padding: rpx(4) rpx(16);
}
.card-final-body {
  background: linear-gradient(135deg, #fef9f5 0%, #fef6f0 50%, #fdf2f7 100%);
  padding: rpx(28) rpx(24);
}
.card-final-text {
  font-size: rpx(28);
  color: #333;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
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

/* 贺卡弹窗 */
.modal-card-write {
  left: 50%;
  transform: translateX(-50%);
  width: 1rem;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}
.card-paper {
  margin: 0 rpx(24);
  padding: rpx(28) rpx(24) rpx(8);
  background: linear-gradient(135deg, #fef6f0 0%, #fdf2f7 40%, #f5ecfa 100%);
  border-radius: rpx(20);
  border: rpx(1) solid rgba(255, 182, 193, 0.3);
  position: relative;
  box-shadow: 0 rpx(4) rpx(20) rgba(255, 150, 180, 0.08);
}
.card-clear-area {
  position: absolute;
  top: rpx(8);
  right: rpx(8);
  z-index: 10;
  padding: rpx(12);
}
.card-clear-btn {
  padding: rpx(4) rpx(16);
  font-size: var(--fs-caption);
  color: #999;
  border: rpx(1) solid #ddd;
  border-radius: rpx(8);
  height: rpx(40);
  line-height: rpx(40);
  text-align: center;
}
.card-nickname-input {
  width: 100%;
  padding: rpx(4) rpx(12);
  font-size: var(--fs-body);
  color: #333;
  border: none;
  background: transparent;
  outline: none;
}
.card-textarea {
  width: 100%;
  min-height: rpx(160);
  padding: rpx(16) rpx(12);
  margin-top: rpx(8);
  font-size: rpx(28);
  line-height: 1.7;
  box-sizing: border-box;
  border: none;
  background: transparent;
  outline: none;
  resize: none;
  font-family: inherit;
}
.card-myname-input {
  width: 100%;
  padding: rpx(4) rpx(12);
  font-size: var(--fs-body);
  color: #333;
  border: none;
  background: transparent;
  text-align: right;
  margin-top: rpx(4);
  outline: none;
}
.card-char-count {
  text-align: right;
  padding: rpx(4) rpx(12) rpx(8);
  font-size: var(--fs-caption);
  color: #bbb;
}
.card-scene-scroll {
  white-space: nowrap;
  overflow-x: auto;
  padding: rpx(8) 0 rpx(12);
  margin: rpx(4) rpx(24) 0;
}
.card-scene-tag {
  display: inline-block;
  padding: rpx(10) rpx(28);
  margin-right: rpx(16);
  border-radius: rpx(30);
  font-size: var(--fs-body);
  color: #666;
  border: rpx(2) solid #eee;
}
.card-scene-tag.active {
  border-color: var(--primary);
  color: var(--primary);
  background: #fffaf5;
}
.card-suggestion-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: rpx(10) rpx(24) rpx(2);
}
.card-suggestion-title {
  font-size: var(--fs-minor);
  color: #8b7f78;
}
.card-refresh-btn {
  padding: rpx(8) rpx(18);
  border-radius: rpx(999);
  font-size: var(--fs-minor);
  line-height: 1.4;
  color: var(--primary);
  background: #fff5f3;
  border: rpx(1) solid rgba(239, 98, 98, 0.22);
}
.card-ai-list {
  margin: rpx(8) rpx(24) 0;
  max-height: rpx(300);
  overflow-y: auto;
}
.card-ai-item {
  display: flex;
  align-items: flex-start;
  gap: rpx(12);
  padding: rpx(20) 0;
  border-bottom: rpx(1) solid #f5f5f5;
}
.card-ai-label {
  flex-shrink: 0;
  padding: rpx(2) rpx(12);
  font-size: var(--fs-caption);
  color: var(--primary);
  border: rpx(1) solid var(--primary);
  border-radius: rpx(6);
  line-height: 1.5;
}
.card-ai-text {
  flex: 1;
  font-size: var(--fs-body);
  color: #333;
  line-height: 1.6;
}
.card-ai-item.selected {
  background: #fff8f0;
}

</style>
