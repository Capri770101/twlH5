<template>
  <div class="page">
    <NavBar title="确认支付" />

    <div v-if="loading" class="mp-loading">
      <div class="mp-spinner"></div>
      <div class="mp-loading-text">正在获取订单…</div>
    </div>

    <div v-else-if="!order" class="mp-empty">
      <div class="mp-emoji">🌷</div>
      <p>没有找到这笔订单</p>
      <p class="mp-sub">请在电脑上重新下单，或用同一个微信账号登录后查看</p>
    </div>

    <template v-else>
      <div class="mp-card">
        <div class="mp-shop">{{ order.shopName || '跳舞兰AI花店' }}</div>
        <div class="mp-amount">¥{{ money(order.totalPrice) }}</div>
        <div class="mp-oid">订单号 {{ order.id }}</div>
      </div>

      <div v-if="order.items && order.items.length" class="mp-items">
        <div v-for="(it, i) in order.items" :key="i" class="mp-item">
          <span class="mp-item-name">{{ it.name }}</span>
          <span class="mp-item-qty">×{{ it.quantity }}</span>
        </div>
      </div>

      <div v-if="done" class="mp-done">
        <div class="mp-emoji">✅</div>
        <p class="mp-done-title">支付成功</p>
        <p class="mp-sub">请回到电脑端继续操作，本页可以关闭了</p>
      </div>

      <div v-else-if="!payable" class="mp-note">
        <p>该订单当前状态为「{{ order.statusText || order.status }}」，无需支付。</p>
        <p class="mp-sub">如需查看，请回到电脑端订单页</p>
      </div>

      <div v-else class="mp-acts">
        <div v-if="!envOk" class="mp-warn">
          请在<b>微信</b>中打开本页完成支付（当前环境无法调起微信支付）
        </div>
        <button class="mp-btn" :disabled="paying" @click="onPay">
          {{ paying ? '正在调起支付…' : ('确认支付 ¥' + money(order.totalPrice)) }}
        </button>
        <p class="mp-sub mp-tip">付款后将自动回到电脑端，请勿关闭电脑上的页面</p>
      </div>
    </template>
  </div>
</template>

<script setup>
// 手机支付页（PC 扫码支付的兜底通道）
// 场景：PC 端 Native 支付权限未开通时，PC 展示「本页链接」的二维码，
//      用户手机微信扫码打开本页 → 点确认支付（JSAPI 拉起收银台）→ PC 轮询到已支付自动跳转。
// 之所以这么做：JSAPI 权限本来就有，无需再开通任何支付产品即可让 PC 用户完成支付。
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getOrderDetail, payOrder } from '@/mock/api'
import { money } from '@/store'
import store from '@/store'
import { isMobileWeChat, invokeWxPay, payFailHint } from '@/utils/wxpay'
import NavBar from '@/components/NavBar.vue'
import { toast } from '@/utils/toast'

const route = useRoute()
const outTradeNo = String(route.params.outTradeNo || '')

const loading = ref(true)
const order = ref(null)
const paying = ref(false)
const done = ref(false)
const envOk = computed(() => isMobileWeChat())
const payable = computed(() => {
  const o = order.value
  if (!o) return false
  return String(o.status || '') === 'pending'
})

onMounted(async () => {
  try {
    order.value = await getOrderDetail(outTradeNo)
  } catch (e) {
    order.value = null
  } finally {
    loading.value = false
  }
})

async function onPay() {
  if (paying.value || !order.value) return
  paying.value = true
  try {
    const pay = await payOrder({
      shopId: order.value.shopId || 'default',
      outTradeNo: order.value.id,
      amountFen: order.value.totalPrice || 0,
      description: '跳舞兰AI花店订单',
      openid: (store.userInfo && store.userInfo.openid) || '',
      tradeType: 'JSAPI'
    })
    if (pay.tradeType !== 'JSAPI') throw new Error('当前环境无法调起微信支付')
    await invokeWxPay(pay)
    done.value = true
  } catch (e) {
    toast(payFailHint(e))
  } finally {
    paying.value = false
  }
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg-page, #f6f7f8);
}
.mp-loading,
.mp-empty {
  padding: rpx(120) rpx(40);
  text-align: center;
  color: var(--text-sub, #888);
  font-size: rpx(26);
}
.mp-spinner {
  width: rpx(56);
  height: rpx(56);
  margin: 0 auto rpx(20);
  border: rpx(4) solid var(--border-light, #eee);
  border-top-color: var(--primary, #d4483c);
  border-radius: 50%;
  animation: mp-spin 0.8s linear infinite;
}
@keyframes mp-spin { to { transform: rotate(360deg); } }
.mp-emoji { font-size: rpx(72); margin-bottom: rpx(12); }
.mp-sub { color: var(--text-light, #aaa); font-size: rpx(24); margin-top: rpx(8); line-height: 1.6; }

.mp-card {
  background: #fff;
  margin: rpx(24);
  padding: rpx(40) rpx(30);
  border-radius: rpx(20);
  text-align: center;
}
.mp-shop { font-size: rpx(26); color: var(--text-sub, #888); }
.mp-amount {
  margin-top: rpx(12);
  font-size: rpx(64);
  font-weight: 700;
  color: var(--primary, #d4483c);
}
.mp-oid { margin-top: rpx(12); font-size: rpx(22); color: var(--text-light, #aaa); }

.mp-items {
  background: #fff;
  margin: 0 rpx(24) rpx(24);
  padding: rpx(20) rpx(30);
  border-radius: rpx(20);
}
.mp-item {
  display: flex;
  justify-content: space-between;
  font-size: rpx(26);
  padding: rpx(10) 0;
  color: var(--text-main, #333);
}
.mp-item-qty { color: var(--text-sub, #888); }

.mp-done,
.mp-note {
  background: #fff;
  margin: 0 rpx(24);
  padding: rpx(50) rpx(30);
  border-radius: rpx(20);
  text-align: center;
  font-size: rpx(28);
  color: var(--text-main, #333);
}
.mp-done-title { font-size: rpx(36); font-weight: 600; margin-top: rpx(6); }

.mp-acts {
  padding: rpx(20) rpx(30) rpx(50);
}
.mp-warn {
  margin-bottom: rpx(20);
  padding: rpx(20);
  border-radius: rpx(12);
  background: #fff7e6;
  color: #b7791f;
  font-size: rpx(24);
  line-height: 1.6;
  b { color: #d4483c; }
}
.mp-btn {
  width: 100%;
  height: rpx(92);
  border: none;
  border-radius: rpx(46);
  background: var(--primary, #d4483c);
  color: #fff;
  font-size: rpx(32);
  font-weight: 600;
  &:disabled { opacity: 0.6; }
}
.mp-tip { text-align: center; }
</style>
