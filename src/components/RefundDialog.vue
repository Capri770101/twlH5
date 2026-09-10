<template>
  <transition name="rf-fade">
    <div v-if="visible" class="rf-mask" @click="onMask">
      <div class="rf-sheet" @click.stop>
        <div class="rf-head">
          <span class="rf-title">申请退款</span>
          <span class="rf-close" @click="close">✕</span>
        </div>

        <div class="rf-amount">
          <span class="rf-amount-label">退款金额</span>
          <span class="rf-amount-value">¥{{ amountText }}</span>
        </div>
        <p class="rf-amount-tip">将按原支付方式退回，到账时间以支付渠道为准</p>

        <div class="rf-section">
          <div class="rf-section-title">退款原因</div>
          <div class="rf-reasons">
            <span
              v-for="r in reasons"
              :key="r"
              class="rf-reason"
              :class="{ active: reason === r }"
              @click="reason = r"
            >{{ r }}</span>
          </div>
        </div>

        <div class="rf-section">
          <div class="rf-section-title">补充说明（选填）</div>
          <textarea
            v-model="remark"
            class="rf-textarea"
            rows="3"
            maxlength="200"
            placeholder="可描述具体问题，便于商家更快处理"
          ></textarea>
        </div>

        <button class="rf-submit" :disabled="submitting || !reason" @click="submit">
          {{ submitting ? '提交中…' : '提交申请' }}
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed } from 'vue'
import { refundOrder } from '@/mock/api'

const props = defineProps({
  visible: { type: Boolean, default: false },
  order: { type: Object, default: () => null }
})
const emit = defineEmits(['update:visible', 'success'])

const reasons = ['不想要了', '商品质量问题', '配送太慢/超时', '送错商品', '其他']
const reason = ref('')
const remark = ref('')
const submitting = ref(false)

const amountText = computed(() => {
  const fen = (props.order && props.order.totalPrice) || 0
  const v = Number(fen) / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
})

function close() {
  if (submitting.value) return
  emit('update:visible', false)
}
function onMask() {
  close()
}

async function submit() {
  if (!props.order || !reason.value || submitting.value) return
  submitting.value = true
  try {
    await refundOrder(props.order.id, {
      reason: reason.value,
      amountFen: props.order.totalPrice,
      shopId: props.order.shopId || 'default'
    })
    emit('success', props.order)
    emit('update:visible', false)
    reason.value = ''
    remark.value = ''
  } catch (e) {
    emit('error', (e && e.message) || '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<style lang="scss" scoped>
.rf-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.rf-sheet {
  width: 100%;
  max-width: 1rem;
  background: #fff;
  border-radius: rpx(28) rpx(28) 0 0;
  padding: rpx(28) rpx(32) calc(rpx(36) + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.rf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: rpx(20);
}
.rf-title {
  font-size: rpx(32);
  font-weight: 700;
  color: var(--text-primary);
}
.rf-close {
  font-size: rpx(30);
  color: var(--text-light);
  padding: rpx(6) rpx(10);
}
.rf-amount {
  display: flex;
  align-items: baseline;
  gap: rpx(12);
}
.rf-amount-label { font-size: rpx(26); color: var(--text-secondary); }
.rf-amount-value { font-size: rpx(40); font-weight: 800; color: #E8615D; }
.rf-amount-tip {
  margin: rpx(6) 0 0;
  font-size: rpx(22);
  color: var(--text-light);
  line-height: 1.5;
}
.rf-section { margin-top: rpx(28); }
.rf-section-title {
  font-size: rpx(26);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: rpx(14);
}
.rf-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(14);
}
.rf-reason {
  padding: rpx(12) rpx(24);
  border-radius: rpx(999);
  background: var(--bg);
  border: rpx(1) solid var(--border-light);
  font-size: rpx(24);
  color: var(--text-secondary);
  &.active {
    border-color: var(--primary);
    background: var(--bg-warm);
    color: var(--primary);
    font-weight: 600;
  }
}
.rf-textarea {
  width: 100%;
  border: rpx(1) solid var(--border);
  border-radius: rpx(12);
  padding: rpx(16);
  font-size: rpx(26);
  color: var(--text-primary);
  outline: none;
  resize: none;
  box-sizing: border-box;
  &::placeholder { color: var(--text-light); }
}
.rf-submit {
  width: 100%;
  height: rpx(92);
  margin-top: rpx(32);
  border: none;
  border-radius: rpx(999);
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(32);
  font-weight: 700;
  &:disabled { opacity: 0.6; }
}
.rf-fade-enter-active, .rf-fade-leave-active { transition: opacity 0.2s ease; }
.rf-fade-enter-from, .rf-fade-leave-to { opacity: 0; }
</style>
