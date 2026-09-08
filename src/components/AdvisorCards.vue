<template>
  <div class="adv-cards">
    <!-- ===== 方案卡 plan_card ===== -->
    <template v-if="ui === 'plan_card'">
      <div class="adv-card-title">为你挑选的花束 <span v-if="plans.length" class="adv-card-count">{{ plans.length }} 款</span></div>
      <div class="plan-scroll">
        <div v-for="p in plans" :key="p.id" class="plan-card">
          <FlowerImage :src="p.image" :emoji="'💐'" class="plan-img" />
          <div class="plan-body">
            <div class="plan-name text-ellipsis">{{ p.name }}</div>
            <div v-if="p.desc" class="plan-desc">{{ p.desc }}</div>
            <div class="plan-meta">
              <span class="plan-merchant text-ellipsis" v-if="p.merchant">{{ p.merchant }}</span>
              <span class="plan-stock" :class="{ out: p.stock <= 0 }">{{ p.stock > 0 ? '现货' : '暂缺' }}</span>
            </div>
            <div class="plan-foot">
              <span class="plan-price">¥{{ p.priceText }}</span>
              <div class="plan-acts">
                <span class="plan-act cart" @click="$emit('buy', { item: p, mode: 'cart' })">加购</span>
                <span class="plan-act buy" @click="$emit('buy', { item: p, mode: 'now' })">购买</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== 订单确认卡 order_card ===== -->
    <template v-else-if="ui === 'order_card'">
      <div class="order-card">
        <div class="oc-head">
          <span class="oc-title">订单确认</span>
          <span v-if="order.order_id" class="oc-id">No.{{ order.order_id }}</span>
        </div>
        <div class="oc-body">
          <div v-for="(it, i) in order.items" :key="i" class="oc-item">
            <span class="oc-name text-ellipsis">{{ it.name }}</span>
            <span class="oc-qty">×{{ it.qty }}</span>
            <span class="oc-price">¥{{ fmt(it.price) }}</span>
          </div>
          <div v-if="!order.items.length" class="oc-empty">明细稍后由店家确认</div>
        </div>
        <div class="oc-total">
          <span>合计</span>
          <span class="oc-total-num">¥{{ fmt(order.total_price) }}</span>
          <span v-if="order.plan_type" class="oc-tag">{{ planTypeText }}</span>
        </div>
        <div class="oc-acts">
          <span class="oc-btn ghost" @click="$emit('view-order', order.order_id)">查看订单</span>
          <span class="oc-btn primary" @click="$emit('order', order)">确认下单</span>
        </div>
      </div>
    </template>

    <!-- ===== 店铺卡 shop_card ===== -->
    <template v-else-if="ui === 'shop_card'">
      <div class="adv-card-title">附近可接单的花店</div>
      <div
        v-for="s in shops"
        :key="s.shop_id"
        class="shop-card"
        @click="$emit('send', '我要 ' + s.name + ' 的花')"
      >
        <div class="shop-main">
          <div class="shop-name text-ellipsis">{{ s.name }}</div>
          <div class="shop-meta">
            <span v-if="s.rating" class="shop-rating">★ {{ s.rating }}</span>
            <span v-if="s.distance_km != null" class="shop-dist">{{ s.distance_km }}km</span>
            <span v-if="s.price_range" class="shop-range">{{ s.price_range }}</span>
          </div>
        </div>
        <span class="shop-pick">选这家</span>
      </div>
    </template>

    <!-- ===== 支付跳转 pay_jump ===== -->
    <template v-else-if="ui === 'pay_jump'">
      <div class="pay-card">
        <div class="pay-title">订单已生成，去支付吧</div>
        <div class="pay-sub" v-if="pay.order_id">订单号 {{ pay.order_id }}</div>
        <div class="pay-btn" @click="$emit('pay', pay)">
          去支付<span v-if="payAmount"> ¥{{ fmt(payAmount) }}</span>
        </div>
      </div>
    </template>

    <!-- ===== 效果图生成任务 image_task ===== -->
    <template v-else-if="ui === 'image_task'">
      <div class="task-card">
        <FlowerImage v-if="taskImage" :src="taskImage" :emoji="'🌸'" class="task-img" />
        <div v-else class="task-ing">
          <span class="task-dot"></span>
          效果图生成中，稍等一下下…
        </div>
      </div>
    </template>

    <!-- ===== 电子贺卡 greeting_card ===== -->
    <template v-else-if="ui === 'greeting_card'">
      <div class="greet-card">
        <FlowerImage :src="greet.image_url" :emoji="'💌'" class="greet-img" />
        <div class="greet-text" v-if="greet.text">{{ greet.text }}</div>
        <div class="greet-foot">
          <span v-if="greet.recipient">To. {{ greet.recipient }}</span>
          <span v-if="greet.sender">From. {{ greet.sender }}</span>
        </div>
        <div class="greet-acts">
          <span class="greet-act" @click="$emit('send', '换一个贺卡模板')">换一张</span>
          <span class="greet-act" @click="$emit('send', '贺卡文案帮我改得再走心一点')">改文案</span>
        </div>
      </div>
    </template>

    <!-- ===== 对话选项 dialog_options ===== -->
    <template v-else-if="ui === 'dialog_options'">
      <div class="adv-opts">
        <span
          v-for="(o, i) in options"
          :key="i"
          class="adv-opt"
          @click="$emit('send', o.value)"
        >{{ o.label }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import FlowerImage from '@/components/FlowerImage.vue'
import { pollAgentTask, AGENT_CONFIG } from '@/mock/api'

const props = defineProps({
  card: { type: Object, default: () => ({}) }
})
defineEmits(['buy', 'send', 'pay', 'order', 'view-order'])

function fmt(n) {
  const v = Number(n)
  return Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : '0.00'
}

// 平台偶发把真实 payload 再包一层 data，这里做兼容
const P = computed(() => {
  const d = props.card && props.card.data ? props.card.data : {}
  const inner = d.data && typeof d.data === 'object' ? d.data : null
  const hasOuter = ['plans', 'shops', 'items', 'options', 'order_id', 'task_id', 'image_url'].some(k => d[k] !== undefined)
  return (!hasOuter && inner) ? inner : d
})

const ui = computed(() => (props.card && props.card.ui) || 'text')

const plans = computed(() =>
  (P.value.plans || []).map(p => {
    const price = Number(p.price != null ? p.price : p.price_yuan != null ? p.price_yuan : 0)
    return {
      id: String(p.id != null ? p.id : p.plan_id != null ? p.plan_id : p.name || Math.random()),
      name: p.name || '推荐花束',
      price,
      priceText: price ? price.toFixed(2) : '到店咨询',
      image: p.image || p.image_url || p.effect_image_url || '',
      desc: p.desc || p.description || '',
      stock: Number(p.stock != null ? p.stock : 99),
      shopId: p.shop_id || p.shopId || 'default',
      merchant: p.merchant_name || p.merchant || ''
    }
  })
)

const order = computed(() => {
  const o = P.value
  return {
    order_id: o.order_id || o.orderId || '',
    items: (o.items || []).map(i => ({
      name: i.name || '花束',
      qty: Number(i.qty != null ? i.qty : i.quantity || 1),
      price: i.price != null ? Number(i.price) : Number(i.unit_price || 0) * Number(i.qty != null ? i.qty : i.quantity || 1)
    })),
    total_price: Number(o.total_price != null ? o.total_price : o.totalPrice || 0),
    plan_type: o.plan_type || o.planType || ''
  }
})

const planTypeText = computed(() => {
  const t = order.value.plan_type
  return t === 'existing' ? '现货花束' : t === 'diy' ? 'DIY 定制' : t || ''
})

const shops = computed(() =>
  (P.value.shops || []).map(s => ({
    shop_id: s.shop_id || s.shopId || s.id || '',
    name: s.name || '花店',
    distance_km: s.distance_km != null ? s.distance_km : (s.distanceKm != null ? s.distanceKm : null),
    price_range: s.price_range || s.priceRange || '',
    rating: s.rating != null ? Number(s.rating).toFixed(1) : ''
  }))
)

const pay = computed(() => P.value)
const payAmount = computed(() => {
  const p = P.value
  return p.params && p.params.total_price != null ? p.params.total_price : (p.total_price != null ? p.total_price : 0)
})

const options = computed(() => (P.value.options || []).map(o => ({ label: o.label || o.text || '', value: o.value != null ? o.value : (o.label || o.text || '') })))

const greet = computed(() => P.value)

// 生图任务：有结果直接展示，否则轮询 /tasks/{id}
const taskImage = ref(P.value.result_url || P.value.image_url || '')
onMounted(() => {
  if (taskImage.value) return
  const poll = P.value.poll
  const taskId = P.value.task_id
  if (!poll && !taskId) return
  const url = String(poll || ('/tasks/' + taskId))
  const full = /^https?:/.test(url) ? url : AGENT_CONFIG.apiBase + (url.startsWith('/') ? url : '/' + url)
  pollAgentTask(full, img => { if (img) taskImage.value = img })
})
</script>

<style scoped lang="scss">
.adv-cards { margin-top: rpx(16); }
.adv-card-title {
  display: flex;
  align-items: center;
  gap: rpx(10);
  margin-bottom: rpx(10);
  font-size: rpx(23);
  font-weight: 700;
  color: #6b625c;
}
.adv-card-count {
  padding: rpx(2) rpx(10);
  border-radius: 999rpx;
  background: #fdeee9;
  color: #d9745f;
  font-size: rpx(20);
  font-weight: 600;
}

/* 方案卡：横向滚动 */
.plan-scroll {
  display: flex;
  gap: rpx(14);
  overflow-x: auto;
  padding-bottom: rpx(6);
  -webkit-overflow-scrolling: touch;
}
.plan-card {
  flex: 0 0 rpx(220);
  width: rpx(220);
  border: 1rpx solid #ece7e0;
  border-radius: rpx(16);
  background: #fff;
  overflow: hidden;
}
.plan-img {
  width: 100%;
  height: rpx(180);
  display: block;
  background: #f4f1ed;
  :deep(img) { width: 100%; height: 100%; object-fit: cover; }
}
.plan-body { padding: rpx(12) rpx(14) rpx(14); }
.plan-name {
  font-size: rpx(24);
  font-weight: 700;
  color: #332c28;
}
.plan-desc {
  margin-top: rpx(4);
  font-size: rpx(20);
  color: #8d8580;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.plan-meta {
  margin-top: rpx(6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: rpx(8);
  font-size: rpx(19);
  color: #a39a93;
}
.plan-merchant { flex: 1; min-width: 0; }
.plan-stock { flex: none; color: #3f9d6d; }
.plan-stock.out { color: #c0b8b1; }
.plan-foot {
  margin-top: rpx(10);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.plan-price {
  color: #e8615d;
  font-size: rpx(26);
  font-weight: 800;
}
.plan-acts { display: flex; gap: rpx(8); }
.plan-act {
  padding: rpx(7) rpx(14);
  border-radius: 999rpx;
  font-size: rpx(20);
  font-weight: 700;
}
.plan-act.cart { background: #f6f3ee; color: #6b625c; }
.plan-act.buy { background: #251f1c; color: #fff; }

/* 订单卡 */
.order-card {
  border: 1rpx solid #ece7e0;
  border-radius: rpx(18);
  background: #fff;
  overflow: hidden;
}
.oc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: rpx(16) rpx(20);
  background: #faf7f3;
  border-bottom: 1rpx solid #f1eee9;
}
.oc-title { font-size: rpx(25); font-weight: 700; color: #332c28; }
.oc-id { font-size: rpx(20); color: #a39a93; }
.oc-body { padding: rpx(14) rpx(20); }
.oc-item {
  display: flex;
  align-items: center;
  gap: rpx(10);
  padding: rpx(6) 0;
  font-size: rpx(23);
  color: #5c524d;
}
.oc-name { flex: 1; min-width: 0; }
.oc-qty { flex: none; color: #a39a93; }
.oc-price { flex: none; width: rpx(140); text-align: right; color: #332c28; }
.oc-empty { font-size: rpx(22); color: #a39a93; }
.oc-total {
  display: flex;
  align-items: center;
  gap: rpx(12);
  padding: rpx(14) rpx(20);
  border-top: 1rpx dashed #ece7e0;
  font-size: rpx(23);
  color: #6b625c;
}
.oc-total-num { margin-left: auto; color: #e8615d; font-size: rpx(30); font-weight: 800; }
.oc-tag {
  padding: rpx(2) rpx(10);
  border-radius: 999rpx;
  background: #eef5f1;
  color: #3f8f68;
  font-size: rpx(19);
}
.oc-acts {
  display: flex;
  gap: rpx(12);
  padding: rpx(14) rpx(20) rpx(18);
}
.oc-btn {
  flex: 1;
  height: rpx(64);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: rpx(32);
  font-size: rpx(24);
  font-weight: 700;
}
.oc-btn.ghost { background: #f6f3ee; color: #6b625c; }
.oc-btn.primary { background: #251f1c; color: #fff; }

/* 店铺卡 */
.shop-card {
  display: flex;
  align-items: center;
  gap: rpx(12);
  padding: rpx(16);
  margin-top: rpx(10);
  border: 1rpx solid #ece7e0;
  border-radius: rpx(16);
  background: #fff;
}
.shop-main { flex: 1; min-width: 0; }
.shop-name { font-size: rpx(25); font-weight: 700; color: #332c28; }
.shop-meta {
  margin-top: rpx(6);
  display: flex;
  gap: rpx(12);
  font-size: rpx(20);
  color: #a39a93;
}
.shop-rating { color: #e0a13a; }
.shop-pick {
  flex: none;
  padding: rpx(8) rpx(16);
  border-radius: 999rpx;
  background: #fdeee9;
  color: #d9745f;
  font-size: rpx(21);
  font-weight: 700;
}

/* 支付 */
.pay-card {
  padding: rpx(18);
  border-radius: rpx(18);
  background: linear-gradient(135deg, #fff6f1, #fdeee9);
  border: 1rpx solid #f6dccf;
}
.pay-title { font-size: rpx(25); font-weight: 700; color: #7a4a34; }
.pay-sub { margin-top: rpx(6); font-size: rpx(20); color: #b08a76; }
.pay-btn {
  margin-top: rpx(14);
  height: rpx(70);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: rpx(35);
  background: #251f1c;
  color: #fff;
  font-size: rpx(25);
  font-weight: 800;
}

/* 生图任务 */
.task-card {
  border-radius: rpx(16);
  overflow: hidden;
  background: #f4f1ed;
}
.task-img {
  width: 100%;
  height: rpx(280);
  display: block;
  :deep(img) { width: 100%; height: 100%; object-fit: cover; }
}
.task-ing {
  display: flex;
  align-items: center;
  gap: rpx(10);
  padding: rpx(28) rpx(24);
  font-size: rpx(23);
  color: #8d8580;
}
.task-dot {
  width: rpx(14);
  height: rpx(14);
  border-radius: 50%;
  background: #d9a25f;
  animation: adv-pulse 1.1s infinite ease-in-out;
}
@keyframes adv-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* 贺卡 */
.greet-card {
  border-radius: rpx(18);
  overflow: hidden;
  background: #fff;
  border: 1rpx solid #ece7e0;
}
.greet-img {
  width: 100%;
  height: rpx(320);
  display: block;
  background: #f7f4ef;
  :deep(img) { width: 100%; height: 100%; object-fit: cover; }
}
.greet-text {
  padding: rpx(16) rpx(18) 0;
  font-size: rpx(24);
  line-height: 1.6;
  color: #4e4641;
}
.greet-foot {
  display: flex;
  justify-content: space-between;
  padding: rpx(12) rpx(18) rpx(10);
  font-size: rpx(20);
  color: #a39a93;
}
.greet-acts {
  display: flex;
  gap: rpx(10);
  padding: 0 rpx(18) rpx(18);
}
.greet-act {
  padding: rpx(8) rpx(16);
  border-radius: 999rpx;
  background: #f6f3ee;
  color: #6b625c;
  font-size: rpx(21);
}

/* 选项 */
.adv-opts {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(12);
}
.adv-opt {
  padding: rpx(10) rpx(20);
  border-radius: 999rpx;
  background: #fff;
  border: 1rpx solid #e3dcd3;
  color: #5c524d;
  font-size: rpx(23);
}
</style>
