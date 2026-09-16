<template>
  <div class="adv-cards">
    <!-- ===== 方案卡 plan_card ===== -->
    <template v-if="ui === 'plan_card'">
      <div class="sect-label">
        <span>为你挑选的花束</span>
        <span v-if="plans.length" class="tally">{{ plans.length }} 款</span>
      </div>
      <div class="prods">
        <article
          v-for="p in plans"
          :key="p.id"
          class="prod"
          @click="$emit('go-detail', p)"
        >
          <div class="prod-img">
            <FlowerImage :src="p.image" :emoji="'💐'" class="prod-img-inner" />
            <span v-if="p.stock <= 0" class="prod-tag out">暂缺</span>
          </div>
          <div class="prod-body">
            <div class="prod-name">{{ p.name }}</div>
            <div v-if="p.desc" class="prod-sub">{{ p.desc }}</div>
            <div v-if="p.merchant" class="prod-meta">{{ p.merchant }}<span v-if="p.stock > 0" class="stock"> · 现货</span></div>
            <div class="price-bar">
              <span class="price-main">¥{{ yuan(p.priceText) }}</span>
            </div>
            <div class="prod-acts" @click.stop>
              <button class="act ghost" @click="$emit('buy', { item: p, mode: 'cart' })">加入购物车</button>
              <button class="act" @click="$emit('buy', { item: p, mode: 'now' })">立即结算</button>
            </div>
          </div>
        </article>
      </div>
    </template>

    <!-- ===== 订单确认卡 order_card ===== -->
    <template v-else-if="ui === 'order_card'">
      <div class="card">
        <div class="card-head">
          <div class="card-kicker">Order</div>
          <div class="card-title">订单确认</div>
          <div class="card-sub" v-if="order.order_id">订单号 {{ order.order_id }}</div>
        </div>
        <div class="card-body">
          <div class="sect">
            <div class="sect-label"><span>明细</span></div>
            <div v-if="order.items.length" class="rows">
              <div v-for="(it, i) in order.items" :key="i" class="row">
                <span class="row-name">{{ it.name }}</span>
                <span class="row-qty">×{{ it.qty }}</span>
                <span class="row-num">¥{{ fmt(it.price) }}</span>
              </div>
            </div>
            <div v-else class="plain">明细稍后由店家确认</div>
          </div>
          <div class="price-bar">
            <span class="price-main">¥{{ fmt(order.total_price) }}<small>合计</small></span>
            <span v-if="planTypeText" class="chip brass">{{ planTypeText }}</span>
          </div>
          <div class="card-actions">
            <button class="act ghost" @click="$emit('view-order', order.order_id)">查看订单</button>
            <button class="act" @click="$emit('order', order)">确认下单</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== 店铺卡 shop_card ===== -->
    <template v-else-if="ui === 'shop_card'">
      <div class="sect-label">
        <span>为你找到的花店</span>
        <span v-if="shops.length" class="tally">{{ shops.length }} 家</span>
      </div>
      <div class="shops">
        <div
          v-for="s in shops"
          :key="s.shop_id"
          class="shop"
          @click="$emit('go-shop', s)"
        >
          <FlowerImage :src="s.avatar" :emoji="'🏪'" class="shop-ava" />
          <div class="shop-main">
            <div class="shop-name">
              <span class="text-ellipsis">{{ s.name }}</span>
              <span v-if="s.rating" class="shop-rating">★ {{ s.rating }}</span>
              <span v-if="s.openText" class="dot-open" :class="{ closed: !s.open }">{{ s.openText }}</span>
            </div>
            <div v-if="s.address" class="shop-meta text-ellipsis">{{ s.address }}</div>
            <div class="shop-meta">
              <span v-if="s.deliveryText">送达 <b>{{ s.deliveryText }}</b></span>
              <span v-if="s.deliveryFee != null">配送 <b>{{ s.deliveryFee > 0 ? '¥' + s.deliveryFee : '免' }}</b></span>
            </div>
          </div>
          <span class="shop-pick">进店 ›</span>
        </div>
      </div>
    </template>

    <!-- ===== 支付跳转 pay_jump ===== -->
    <template v-else-if="ui === 'pay_jump'">
      <div class="card">
        <div class="card-head pay-head">
          <div class="card-kicker">Payment</div>
          <div class="card-title">订单已生成，去支付吧</div>
          <div class="card-sub" v-if="pay.order_id">订单号 {{ pay.order_id }}</div>
        </div>
        <div class="card-body">
          <button class="act block" @click="$emit('pay', pay)">
            去支付<span v-if="payAmount"> ¥{{ fmt(payAmount) }}</span>
          </button>
        </div>
      </div>
    </template>

    <!-- ===== 效果图生成任务 image_task ===== -->
    <template v-else-if="ui === 'image_task'">
      <div class="frame">
        <FlowerImage v-if="taskImage" :src="taskImage" :emoji="'🌸'" class="frame-img">
        </FlowerImage>
        <div v-else class="shimmer"></div>
        <div class="frame-cap">
          <span>{{ taskImage ? '效果图' : '正在生成效果图' }}</span>
          <b>{{ taskImage ? 'AI 生成' : '请稍候' }}</b>
        </div>
      </div>
    </template>

    <!-- ===== 电子贺卡 greeting_card ===== -->
    <template v-else-if="ui === 'greeting_card'">
      <div class="card">
        <FlowerImage v-if="greetImg" :src="greetImg" :emoji="'💌'" class="greet-img" />
        <div class="card-body">
          <div class="card-kicker" v-if="greet.recipient || greet.sender">
            <template v-if="greet.recipient">To. {{ greet.recipient }}</template>
            <template v-if="greet.recipient && greet.sender"> · </template>
            <template v-if="greet.sender">From. {{ greet.sender }}</template>
          </div>
          <div v-if="greet.text" class="quote">{{ greet.text }}</div>
          <div class="card-actions">
            <button class="act ghost" @click="$emit('send', '换一个贺卡模板')">换一张</button>
            <button class="act ghost" @click="$emit('send', '贺卡文案帮我改得再走心一点')">改文案</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== DIY 方案卡 diy_plan_card ===== -->
    <template v-else-if="ui === 'diy_plan_card'">
      <div class="card">
        <!-- 封面 -->
        <div class="diy-cover">
          <FlowerImage v-if="diyPlan.image" :src="diyPlan.image" :emoji="'💐'" class="diy-cover-inner" />
          <div v-else class="diy-cover-ph">
            <span class="ph-emoji">💐</span>
            <span class="ph-text">效果图生成中</span>
          </div>
        </div>

        <!-- 报头 -->
        <div class="card-head">
          <div class="card-kicker">Atelier Plan</div>
          <div class="card-title">{{ diyPlan.name || 'DIY 方案' }}</div>
          <div v-if="diyPlan.desc" class="card-sub">{{ diyPlan.desc }}</div>
          <div class="chips" v-if="diyPlan.skillLevel || diyPlan.suitableFor">
            <span v-if="diyPlan.skillLevel" class="chip">{{ diyPlan.skillLevel }}</span>
            <span v-if="diyPlan.suitableFor" class="chip brass">{{ diyPlan.suitableFor }}</span>
          </div>
        </div>

        <div class="card-body">
          <!-- 花材清单 -->
          <div v-if="diyPlan.materials.length" class="sect">
            <div class="sect-label"><span>花材清单</span></div>
            <div class="fl">
              <div v-for="(m, i) in diyPlan.materials" :key="i" class="fl-row">
                <span class="fl-name">{{ m.name }}</span>
                <span class="fl-qty">{{ m.qty > 0 ? '×' + m.qty + (m.unit || '支') : '适量' }}</span>
                <span v-if="m.subText" class="fl-sec">{{ m.subText }}</span>
              </div>
            </div>
          </div>

          <!-- 预算明细 -->
          <div v-if="diyPlan.budget.length" class="sect">
            <div class="sect-label"><span>预算明细</span></div>
            <div class="rows boxed">
              <div v-for="(b, i) in diyPlan.budget" :key="i" class="row">
                <span class="row-name">{{ b.label }}</span>
                <span class="row-num">¥{{ b.amountText }}</span>
              </div>
              <div v-if="diyPlan.budgetTotalText" class="row total">
                <span class="row-name">合计</span>
                <span class="row-num">¥{{ diyPlan.budgetTotalText }}</span>
              </div>
            </div>
          </div>

          <!-- 养护贴士 -->
          <div v-if="diyPlan.careTips" class="sect">
            <div class="sect-label"><span>养护贴士</span></div>
            <div class="plain">{{ diyPlan.careTips }}</div>
          </div>

          <!-- 贺卡建议 -->
          <div v-if="diyPlan.greeting" class="sect">
            <div class="sect-label"><span>贺卡建议</span></div>
            <div class="quote">{{ diyPlan.greeting }}</div>
            <button class="copy-btn" @click="copyText(diyPlan.greeting, '贺卡文案已复制')">
              {{ copyHint || '一键复制' }}
            </button>
          </div>

          <!-- 价格 + 动作 -->
          <div class="price-bar">
            <span class="price-main">¥{{ yuan(diyPlan.priceText) }}<small>整束预估</small></span>
          </div>
          <div class="card-actions">
            <button class="act ghost" @click="$emit('save-diy-plan', diyPlan)">保存到我的方案</button>
            <button class="act" @click="$emit('buy', { item: diyPlan.buyItem, mode: 'cart' })">加入购物车</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== 对话选项 dialog_options ===== -->
    <template v-else-if="ui === 'dialog_options'">
      <div class="adv-opts">
        <button
          v-for="(o, i) in options"
          :key="i"
          class="opt-chip"
          @click="$emit('send', o.value)"
        >{{ o.label }}</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import FlowerImage from '@/components/FlowerImage.vue'
import { pollAgentTask, AGENT_CONFIG } from '@/mock/api'
import { yuan } from '@/store'

const props = defineProps({
  card: { type: Object, default: () => ({}) }
})
defineEmits(['buy', 'send', 'pay', 'order', 'view-order', 'save-diy-plan', 'go-shop', 'go-detail'])

function fmt(n) {
  const v = Number(n)
  return Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : '0.00'
}

// 智能体平台下发的图片偶为相对路径（/uploads/...），补 aistore 域名
const AISTORE_BASE = 'https://aistore.xiangbinmeigui.com'
function absImg(u) {
  const s = String(u || '')
  if (!s) return ''
  if (/^https?:/i.test(s)) return s
  if (s.startsWith('/uploads')) return AISTORE_BASE + s
  return s
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
      image: absImg(p.image || p.image_url || p.effect_image_url || ''),
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
  (P.value.shops || []).map(s => {
    const open = s.is_open_now != null ? !!s.is_open_now : (s.status ? s.status !== 'closed' : true)
    return {
      shop_id: String(s.shop_id || s.shopId || s.id || ''),
      name: s.name || '花店',
      avatar: absImg(s.avatar || s.cover || s.logo || ''),
      rating: s.rating != null ? Number(s.rating).toFixed(1) : '',
      address: s.address || '',
      open,
      openText: s.open_status_text || (open ? '营业中' : '休息中'),
      deliveryText: s.delivery_time || '',
      deliveryFee: s.delivery_fee != null ? Number(s.delivery_fee) : null,
      distance_km: s.distance_km != null ? s.distance_km : (s.distanceKm != null ? s.distanceKm : null),
      price_range: s.price_range || s.priceRange || ''
    }
  })
)

const pay = computed(() => P.value)
const payAmount = computed(() => {
  const p = P.value
  return p.params && p.params.total_price != null ? p.params.total_price : (p.total_price != null ? p.total_price : 0)
})

const options = computed(() => (P.value.options || []).map(o => ({ label: o.label || o.text || '', value: o.value != null ? o.value : (o.label || o.text || '') })))

const greet = computed(() => P.value)
const greetImg = computed(() => absImg(P.value.image_url || P.value.image || ''))

// ===== DIY 方案卡 diy_plan_card =====
const diyPlan = computed(() => {
  const d = P.value || {}
  const priceRaw = Number(d.price != null ? d.price : d.price_yuan != null ? d.price_yuan : 0)
  // 容错：若价格 > 10000 猜成"分"，自动 /100
  const price = priceRaw > 10000 ? priceRaw / 100 : priceRaw
  const materials = (d.materials || []).map(m => {
    const qty = Number(m.qty != null ? m.qty : m.quantity || 0)
    const sub = Number(m.price_yuan != null ? m.price_yuan : m.unit_price || 0)
    const subText = sub ? '¥' + sub.toFixed(2) + (qty ? ' × ' + qty + (m.unit || '支') : '') : ''
    return {
      name: m.name || '花材',
      qty: qty || 0,
      unit: m.unit || '支',
      subText,
      _sub: sub,
      _qty: qty
    }
  })
  const budget = (d.budget || []).map(b => ({
    label: b.label || '其他',
    amount: Number(b.amount_yuan != null ? b.amount_yuan : b.amount != null ? b.amount : 0),
    amountText: (Number(b.amount_yuan != null ? b.amount_yuan : b.amount != null ? b.amount : 0)).toFixed(2)
  }))
  const budgetTotal = budget.reduce((s, b) => s + b.amount, 0)
  const id = String(d.plan_id != null ? d.plan_id : d.id != null ? d.id : ('diy_' + Date.now()))
  const name = d.name || 'DIY 方案'
  const skillLevel = d.skill_level || ''
  const suitableFor = d.suitable_for || ''
  const careTips = d.care_tips || ''
  const greeting = d.greeting_suggestion || d.greeting || ''
  // 构造加购用的 buyItem（兼容现有 onCardBuy）
  const buyItem = {
    id: 'diy_' + id,
    name,
    price,
    priceText: price ? price.toFixed(2) : '到店咨询',
    image: absImg(d.effect_image_url || d.image_url || d.image || ''),
    desc: d.desc || '',
    stock: 99,
    shopId: d.shop_id || 'default',
    merchant: d.merchant_name || d.merchant || 'AI 定制',
    _isDiy: true,
    _diyPayload: d
  }
  return {
    id,
    name,
    desc: d.desc || '',
    price,
    priceText: price ? price.toFixed(2) : '到店咨询',
    image: absImg(d.effect_image_url || d.image_url || d.image || ''),
    skillLevel,
    suitableFor,
    materials,
    budget,
    budgetTotalText: budgetTotal ? budgetTotal.toFixed(2) : '',
    careTips,
    greeting,
    buyItem
  }
})

function copyText(t, hint) {
  const text = String(t || '')
  if (!text) return
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showHint(hint || '已复制'))
  } else {
    showHint('已复制：' + text.slice(0, 20))
  }
}
const copyHint = ref('')
let copyTimer = null
function showHint(t) {
  copyHint.value = t
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copyHint.value = '' }, 1500)
}

// 生图任务：有结果直接展示，否则轮询 /tasks/{id}
const taskImage = ref(absImg(P.value.result_url || P.value.image_url || ''))
onMounted(() => {
  if (taskImage.value) return
  const poll = P.value.poll
  const taskId = P.value.task_id
  if (!poll && !taskId) return
  const url = String(poll || ('/tasks/' + taskId))
  const full = /^https?:/.test(url) ? url : AGENT_CONFIG.apiBase + (url.startsWith('/') ? url : '/' + url)
  pollAgentTask(full, img => { if (img) taskImage.value = absImg(img) })
})
</script>

<style scoped lang="scss">
/* ══════════════════════════════════════════════════════════════
   顾问卡片 —— 「花艺标本册」风格（对齐 api.tiaowulan.com/demo）
   变量由父页面 .advisor-page 提供（--paper/--ink/--moss/--brass/--line…），
   此处只做兜底，避免组件被别处复用时失色。
   ══════════════════════════════════════════════════════════════ */
.adv-cards {
  --paper: #f5f1e9;
  --paper-2: #fdfbf7;
  --paper-3: #efeae0;
  --ink: #1e1c19;
  --ink-2: #5b554b;
  --ink-3: #8e877b;
  --moss: #2b4133;
  --moss-2: #3d5a49;
  --moss-3: #6b8574;
  --brass: #a58449;
  --brass-2: #c8ac79;
  --line: #e4dcce;
  --line-2: #d3c8b4;
  --danger: #8e3b33;
  --font-display: "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", "STSong", "SimSun", Georgia, serif;
  --font-num: Georgia, "Times New Roman", serif;
  margin-top: rpx(28);
}

/* ── 区块小标题（全大写字距 + 右侧细线）── */
.sect-label {
  display: flex;
  align-items: center;
  gap: rpx(18);
  font-family: var(--font-num);
  font-size: rpx(20);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin-bottom: rpx(18);
}
.sect-label > span:first-child { flex: none; }
.sect-label::after {
  content: "";
  flex: 1;
  height: 1rpx;
  background: var(--line);
}
.tally {
  flex: none;
  order: 3;
  font-family: var(--font-body);
  font-size: rpx(19);
  letter-spacing: 0.04em;
  color: var(--brass);
  padding: rpx(4) rpx(16);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(999);
  background: var(--paper-2);
  text-transform: none;
}

/* ── 标本卡外壳 ── */
.card {
  background: var(--paper-2);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(28);
  overflow: hidden;
  box-shadow: 0 rpx(4) rpx(8) rgba(30, 28, 25, 0.05), 0 rpx(24) rpx(64) rgba(30, 28, 25, 0.07);
}
.card-head {
  padding: rpx(38) rpx(44) rpx(30);
  border-bottom: 1rpx solid var(--line);
  background: linear-gradient(180deg, #fffdfa, #fbf7ef);
}
.card-kicker {
  font-family: var(--font-num);
  font-size: rpx(20);
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--brass);
  margin-bottom: rpx(14);
}
.card-title {
  font-family: var(--font-display);
  font-size: rpx(42);
  font-weight: 600;
  letter-spacing: 0.03em;
  line-height: 1.35;
  color: var(--ink);
}
.card-sub {
  font-size: rpx(25);
  color: var(--ink-3);
  margin-top: rpx(14);
  line-height: 1.6;
}
.card-body { padding: rpx(36) rpx(44) rpx(40); }
.sect { margin-bottom: rpx(34); }
.sect:last-child { margin-bottom: 0; }

/* 标签 chips */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(14);
  margin-top: rpx(26);
}
.chip {
  font-size: rpx(23);
  color: var(--moss);
  background: #edf1ec;
  border: 1rpx solid #dce4db;
  padding: rpx(6) rpx(20);
  border-radius: rpx(999);
  letter-spacing: 0.03em;
}
.chip.brass {
  color: var(--brass);
  background: #f7f0e2;
  border-color: #e9dcc2;
}

/* ── 花材清单 ── */
.fl { display: flex; flex-direction: column; gap: rpx(18); }
.fl-row {
  display: flex;
  align-items: baseline;
  gap: rpx(22);
  flex-wrap: wrap;
}
.fl-name {
  font-family: var(--font-display);
  font-size: rpx(32);
  letter-spacing: 0.04em;
  color: var(--ink);
}
.fl-qty {
  font-family: var(--font-num);
  font-size: rpx(26);
  color: var(--brass);
  letter-spacing: 0.02em;
}
.fl-sec {
  font-size: rpx(24);
  color: var(--ink-2);
  flex: 1;
  min-width: rpx(240);
  text-align: right;
}

/* ── 明细行 ── */
.rows { display: flex; flex-direction: column; }
.rows.boxed {
  padding: rpx(24) rpx(30);
  background: var(--paper-2);
  border: 1rpx solid var(--line);
  border-radius: rpx(24);
}
.row {
  display: flex;
  align-items: center;
  gap: rpx(20);
  padding: rpx(12) 0;
  font-size: rpx(27);
  color: var(--ink-2);
}
.row-name { flex: 1; min-width: 0; }
.row-qty { flex: none; color: var(--ink-3); }
.row-num {
  flex: none;
  font-family: var(--font-num);
  color: var(--ink);
  text-align: right;
}
.row.total {
  margin-top: rpx(14);
  padding-top: rpx(18);
  border-top: 1rpx dashed var(--line-2);
  font-weight: 500;
}
.row.total .row-name,
.row.total .row-num { color: var(--ink); }

.plain {
  font-size: rpx(28);
  color: var(--ink-2);
  line-height: 1.75;
}

/* ── 引用式文本块（贺卡建议）── */
.quote {
  font-family: var(--font-display);
  font-size: rpx(30);
  line-height: 1.85;
  color: var(--moss);
  border-left: rpx(4) solid var(--brass-2);
  padding: rpx(4) 0 rpx(4) rpx(28);
  letter-spacing: 0.02em;
  white-space: pre-wrap;
}
.copy-btn {
  margin-top: rpx(20);
  font-family: inherit;
  font-size: rpx(22);
  letter-spacing: 0.05em;
  color: var(--moss);
  background: none;
  border: 1rpx solid var(--line-2);
  border-radius: rpx(999);
  padding: rpx(10) rpx(26);
  cursor: pointer;
  transition: 0.2s;
}
.copy-btn:active { background: #edf1ec; border-color: var(--moss-3); }

/* ── 价格条 ── */
.price-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: rpx(24);
  flex-wrap: wrap;
  border-top: 1rpx solid var(--line-2);
  margin-top: rpx(32);
  padding-top: rpx(28);
}
.price-main {
  font-family: var(--font-num);
  font-size: rpx(54);
  color: var(--moss);
  letter-spacing: 0.01em;
  line-height: 1;
}
.price-main small {
  font-size: rpx(23);
  letter-spacing: 0.1em;
  color: var(--ink-3);
  margin-left: rpx(12);
  font-family: var(--font-body);
}

/* ── 卡片动作 ── */
.card-actions {
  display: flex;
  gap: rpx(18);
  flex-wrap: wrap;
  margin-top: rpx(28);
}
.act {
  font-family: inherit;
  font-size: rpx(25);
  letter-spacing: 0.05em;
  cursor: pointer;
  padding: rpx(16) rpx(32);
  border-radius: rpx(999);
  transition: 0.22s;
  border: 1rpx solid var(--moss);
  background: var(--moss);
  color: #f4f2ea;
  white-space: nowrap;
}
.act:active { background: var(--moss-2); border-color: var(--moss-2); }
.act.ghost {
  background: none;
  color: var(--moss);
  border-color: var(--line-2);
}
.act.ghost:active { background: #edf1ec; border-color: var(--moss-3); }
.act.block {
  display: block;
  width: 100%;
  text-align: center;
  padding: rpx(22) rpx(32);
  font-size: rpx(28);
}

/* ── 商品网格（方案卡 / DIY 封面共用）── */
.prods {
  /* 助手消息列比容器窄（左侧黄铜竖线缩进），可用宽约 0.86rem：
     两列需 2×min + gap ≤ 0.86rem，故 min 取 290rpx，仍留约 20px 余量 */
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(rpx(290), 1fr));
  gap: rpx(24);
}
.prod {
  background: var(--paper-2);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(24);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 rpx(2) rpx(8) rgba(30, 28, 25, 0.04);
  cursor: pointer;
  transition: 0.24s;
}
.prod:active { border-color: var(--brass-2); background: #fffdfa; }
.prod-img {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--paper-3);
  overflow: hidden;
}
.prod-img-inner {
  width: 100%;
  height: 100%;
  display: block;
  :deep(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
}
/* 图片组件的兜底底色是粉紫渐变，与标本册配色冲突 → 统一改回纸色 */
.prod-img-inner,
.diy-cover-inner,
.greet-img,
.frame-img {
  background: var(--paper-3);
}
.prod-img-inner :deep(.f-image),
.diy-cover-inner :deep(.f-image),
.greet-img :deep(.f-image),
.frame-img :deep(.f-image),
.frame-img :deep(.f-image-fallback),
.prod-img-inner :deep(.f-image-fallback),
.diy-cover-inner :deep(.f-image-fallback),
.greet-img :deep(.f-image-fallback) {
  background: var(--paper-3);
}
.prod-tag {
  position: absolute;
  top: rpx(16);
  left: rpx(16);
  font-size: rpx(21);
  letter-spacing: 0.06em;
  background: rgba(43, 65, 51, 0.9);
  color: #f2f0e8;
  padding: rpx(6) rpx(18);
  border-radius: rpx(999);
}
.prod-tag.out { background: rgba(142, 59, 51, 0.88); }
.prod-body {
  padding: rpx(24) rpx(28) rpx(28);
  display: flex;
  flex-direction: column;
  gap: rpx(10);
  flex: 1;
  min-width: 0;
}
.prod-name {
  font-family: var(--font-display);
  font-size: rpx(32);
  line-height: 1.4;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prod-sub {
  font-size: rpx(23);
  color: var(--ink-3);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.prod-meta {
  font-size: rpx(21);
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prod-meta .stock { color: #3d6a4a; }
/* 商品卡内部价格条去掉上边线，避免与卡片边框重复 */
.prod .price-bar {
  border-top: none;
  margin-top: auto;
  padding-top: rpx(14);
}
.prod .price-main { font-size: rpx(40); }
.prod-acts {
  display: flex;
  gap: rpx(10);
  margin-top: rpx(14);
}
/* 两列布局下卡片内宽只有 ~0.4rem，按钮必须能收缩，否则会撑破卡片 */
.prod-acts .act {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
  padding: rpx(13) rpx(6);
  font-size: rpx(21);
  letter-spacing: 0.02em;
}

/* ── 店铺卡 ── */
.shops { display: flex; flex-direction: column; gap: rpx(22); }
.shop {
  background: var(--paper-2);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(24);
  padding: rpx(30) rpx(34);
  display: flex;
  gap: rpx(28);
  align-items: flex-start;
  box-shadow: 0 rpx(2) rpx(8) rgba(30, 28, 25, 0.04);
  cursor: pointer;
  transition: 0.22s;
}
.shop:active { border-color: var(--brass-2); background: #fffdfa; }
.shop-ava {
  width: rpx(92);
  height: rpx(92);
  border-radius: rpx(18);
  flex: none;
  overflow: hidden;
  background: var(--paper-3);
  border: 1rpx solid var(--line);
  :deep(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
}
.shop-main { flex: 1; min-width: 0; }
.shop-name {
  font-family: var(--font-display);
  font-size: rpx(32);
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: rpx(16);
  flex-wrap: wrap;
}
.shop-rating {
  flex: none;
  font-family: var(--font-num);
  font-size: rpx(22);
  color: var(--brass);
}
.dot-open {
  flex: none;
  font-size: rpx(21);
  letter-spacing: 0.06em;
  padding: rpx(4) rpx(16);
  border-radius: rpx(999);
  background: #e9f0e9;
  color: #3d6a4a;
  border: 1rpx solid #d5e3d7;
}
.dot-open.closed {
  background: #f3ede6;
  color: #8a6b4a;
  border-color: #e7dacb;
}
.shop-meta {
  font-size: rpx(24);
  color: var(--ink-3);
  margin-top: rpx(12);
  line-height: 1.6;
}
.shop-meta b { color: var(--ink-2); font-weight: 500; font-family: var(--font-num); }
.shop-pick {
  flex: none;
  align-self: center;
  font-size: rpx(23);
  color: var(--moss);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

/* ── DIY 封面 ── */
.diy-cover {
  position: relative;
  width: 100%;
  background: var(--paper-3);
  border-bottom: 1rpx solid var(--line);
}
.diy-cover-inner {
  width: 100%;
  display: block;
  :deep(img) { width: 100%; height: auto; display: block; }
}
.diy-cover-ph {
  aspect-ratio: 3 / 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: rpx(14);
  background: linear-gradient(100deg, #efeae0 20%, #f8f5ee 42%, #efeae0 64%);
  background-size: 220% 100%;
  animation: adv-sh 1.6s linear infinite;
}
.ph-emoji { font-size: rpx(96); opacity: 0.5; }
.ph-text { font-size: rpx(24); color: var(--ink-3); }
@keyframes adv-sh { to { background-position: -220% 0; } }

/* ── 效果图 ── */
.frame {
  border: 1rpx solid var(--line-2);
  border-radius: rpx(28);
  overflow: hidden;
  background: var(--paper-2);
  box-shadow: 0 rpx(4) rpx(8) rgba(30, 28, 25, 0.05), 0 rpx(24) rpx(64) rgba(30, 28, 25, 0.07);
  margin-top: rpx(28);
}
.frame-img {
  width: 100%;
  display: block;
  :deep(img) { width: 100%; height: auto; display: block; }
}
.shimmer {
  aspect-ratio: 3 / 4;
  background: linear-gradient(100deg, #efeae0 20%, #f8f5ee 42%, #efeae0 64%);
  background-size: 220% 100%;
  animation: adv-sh 1.6s linear infinite;
}
.frame-cap {
  padding: rpx(22) rpx(36);
  border-top: 1rpx solid var(--line);
  font-size: rpx(23);
  color: var(--ink-3);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: rpx(20);
  letter-spacing: 0.04em;
}
.frame-cap b { font-family: var(--font-num); color: var(--ink-2); font-weight: 500; }

/* ── 贺卡图 ── */
.greet-img {
  width: 100%;
  display: block;
  background: var(--paper-3);
  :deep(img) { width: 100%; height: auto; display: block; }
}

/* ── 选项 chips ── */
.adv-opts {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(16);
}
.opt-chip {
  font-family: inherit;
  font-size: rpx(25);
  letter-spacing: 0.03em;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(999);
  padding: rpx(14) rpx(30);
  cursor: pointer;
  transition: 0.2s;
}
.opt-chip:active { color: var(--moss); border-color: var(--moss-3); background: #edf1ec; }
</style>
