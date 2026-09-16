<template>
  <transition name="qrpay-fade">
    <div v-if="visible" class="qrpay-mask" @click.self="onCancel">
      <div class="qrpay-card">
        <div class="qrpay-head">
          <span class="qrpay-title">{{ isLink ? '手机扫码支付' : '微信扫码支付' }}</span>
          <span class="qrpay-amount">¥{{ money(amountFen) }}</span>
        </div>

        <div class="qrpay-qrbox">
          <img v-if="qrDataUrl" class="qrpay-qr" :src="qrDataUrl" alt="支付二维码" />
          <div v-else class="qrpay-qrfallback">
            <div class="qrpay-emoji">📱</div>
            <p>二维码未能生成，请改用手机打开本页支付</p>
            <p class="qrpay-raw">{{ codeUrl }}</p>
          </div>
        </div>

        <div v-if="isLink" class="qrpay-hint">
          请用手机<b>微信「扫一扫」</b>扫描二维码<br />
          在<b>手机上</b>完成支付
          <div class="qrpay-sub">支付完成后本页会自动跳转，请勿关闭</div>
        </div>
        <div v-else class="qrpay-hint">
          请用手机<b>微信「扫一扫」</b>扫描二维码完成支付
          <div class="qrpay-sub">支付完成后本页会自动跳转，请勿关闭</div>
        </div>

        <div class="qrpay-state" :class="stateClass">{{ statusText }}</div>

        <div class="qrpay-acts">
          <button class="qrpay-btn" :disabled="closing" @click="onCancel">取消支付</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
// PC 扫码支付面板（微信 Native 支付）
// 用在后端返回 tradeType='NATIVE' + code_url/qrDataUrl 时：展示二维码并轮询支付结果。
// 为什么轮询：PC 端用户是"在手机上付"，本页只能靠查单感知结果。
// 后端 /api/pay/query 在查到 trade_state=SUCCESS 时会就地补记订单（回调丢失也能自愈）。
import { ref, computed, watch, onUnmounted } from 'vue'
import { money } from '@/store'
import { payQueryStatus } from '@/mock/api'

const props = defineProps({
  visible: { type: Boolean, default: false },
  outTradeNo: { type: String, default: '' },
  shopId: { type: String, default: '' },
  amountFen: { type: Number, default: 0 },
  qrDataUrl: { type: String, default: '' },
  codeUrl: { type: String, default: '' },
  // native = 微信 Native 支付码（扫码直接进收银台）
  // link   = 兜底：二维码指向「手机支付页」，用户在手机上点一下再付
  //          （Native 权限未开通时用，不需要额外开通任何支付产品）
  mode: { type: String, default: 'native' }
})
const emit = defineEmits(['success', 'close', 'expire', 'update:visible'])

const isLink = computed(() => props.mode === 'link')

const POLL_MS = 3000
const MAX_TRIES = 100 // 约 5 分钟
const tries = ref(0)
const closing = ref(false)
let timer = null

const expired = ref(false)
const statusText = computed(() => {
  if (expired.value) return '二维码已失效，请重新下单获取'
  return '等待支付…'
})
const stateClass = computed(() => (expired.value ? 'is-expired' : 'is-waiting'))

function stop() {
  if (timer) { clearInterval(timer); timer = null }
}

async function tick() {
  if (!props.outTradeNo) return
  tries.value += 1
  if (tries.value > MAX_TRIES) {
    expired.value = true
    stop()
    emit('expire')
    return
  }
  try {
    const r = await payQueryStatus(props.outTradeNo, props.shopId)
    const st = String((r && r.trade_state) || '').toUpperCase()
    if (st === 'SUCCESS') {
      stop()
      emit('success', r)
      return
    }
    if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(st)) {
      stop()
      expired.value = true
      emit('expire')
    }
  } catch (e) {
    // 网络/接口异常不打断轮询：下一次继续（后端查单本身带自愈）
  }
}

function start() {
  stop()
  expired.value = false
  tries.value = 0
  timer = setInterval(tick, POLL_MS)
  tick()
}

watch(() => props.visible, v => { v ? start() : stop() })
watch(() => props.outTradeNo, () => { if (props.visible) start() })
onUnmounted(stop)

function onCancel() {
  closing.value = true
  stop()
  emit('update:visible', false)
  emit('close')
  setTimeout(() => { closing.value = false }, 200)
}
</script>

<style lang="scss" scoped>
.qrpay-mask {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: rpx(40);
}
.qrpay-card {
  width: 100%;
  max-width: rpx(600);
  background: #fff;
  border-radius: rpx(24);
  padding: rpx(44) rpx(36) rpx(32);
  box-shadow: 0 rpx(16) rpx(48) rgba(0, 0, 0, 0.18);
  text-align: center;
}
.qrpay-head {
  display: flex;
  flex-direction: column;
  gap: rpx(8);
  margin-bottom: rpx(24);
}
.qrpay-title {
  font-size: rpx(34);
  font-weight: 600;
  color: var(--text-main, #222);
}
.qrpay-amount {
  font-size: rpx(44);
  font-weight: 700;
  color: var(--primary, #d4483c);
}
.qrpay-qrbox {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: rpx(16);
  border: rpx(2) solid var(--border-light, #eee);
  border-radius: rpx(16);
  background: #fff;
}
.qrpay-qr {
  width: rpx(360);
  height: rpx(360);
  display: block;
}
.qrpay-qrfallback {
  padding: rpx(40) rpx(20);
  color: var(--text-sub, #888);
  font-size: rpx(26);
  line-height: 1.6;
}
.qrpay-emoji { font-size: rpx(64); margin-bottom: rpx(12); }
.qrpay-raw {
  margin-top: rpx(12);
  font-size: rpx(20);
  word-break: break-all;
  color: var(--text-light, #aaa);
}
.qrpay-hint {
  margin-top: rpx(24);
  font-size: rpx(26);
  color: var(--text-main, #333);
  line-height: 1.6;
  b { color: var(--primary, #d4483c); }
}
.qrpay-sub {
  margin-top: rpx(6);
  font-size: rpx(22);
  color: var(--text-sub, #999);
}
.qrpay-state {
  margin-top: rpx(20);
  font-size: rpx(26);
  padding: rpx(10) 0;
  border-radius: rpx(8);
  &.is-waiting { color: var(--text-sub, #888); }
  &.is-expired { color: var(--primary, #d4483c); }
}
.qrpay-acts { margin-top: rpx(16); }
.qrpay-btn {
  width: 100%;
  height: rpx(84);
  border: none;
  border-radius: rpx(42);
  background: #f5f5f5;
  color: var(--text-sub, #666);
  font-size: rpx(28);
  &:disabled { opacity: 0.6; }
}
.qrpay-fade-enter-active,
.qrpay-fade-leave-active { transition: opacity 0.2s; }
.qrpay-fade-enter-from,
.qrpay-fade-leave-to { opacity: 0; }
</style>
