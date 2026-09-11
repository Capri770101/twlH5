<template>
  <div class="advisor-page">
    <NavBar title="AI花艺顾问" />

    <!-- 对话管理入口 + 连接状态 + 新对话 -->
    <div class="advisor-status">
      <span class="conv-toggle" @click="drawerOpen = !drawerOpen">≡</span>
      <span class="status-dot" :class="agentMode"></span>
      <span class="status-text">{{ agentMode === 'real' ? '已连接智能体' : '演示模式（未连接智能体）' }}</span>
      <span class="new-chat" @click="newConversation">新对话</span>
    </div>

    <!-- 对话管理抽屉 -->
    <div class="conv-mask" v-if="drawerOpen" @click="drawerOpen = false"></div>
    <div class="conv-drawer" :class="{ open: drawerOpen }">
      <div class="conv-drawer-head">
        <span>对话管理</span>
        <span class="conv-drawer-close" @click="drawerOpen = false">✕</span>
      </div>
      <div class="conv-list">
        <div
          v-for="c in conversations"
          :key="c.id"
          class="conv-item"
          :class="{ active: c.id === activeId }"
          @click="selectConversation(c.id)"
        >
          <div class="conv-item-main">
            <span class="conv-item-title text-ellipsis">{{ c.title }}</span>
            <span class="conv-item-preview text-ellipsis">{{ lastText(c) }}</span>
          </div>
          <div class="conv-item-actions">
            <span class="conv-act" @click.stop="renameConversation(c.id)" title="重命名">✎</span>
            <span class="conv-act conv-del" @click.stop="deleteConversation(c.id)" title="删除">🗑</span>
          </div>
        </div>
      </div>
      <div class="conv-new" @click="newConversation">＋ 新建对话</div>
    </div>

    <!-- 场景预设 -->
    <div v-if="presets.length" class="preset-scroll">
      <div
        v-for="p in presets"
        :key="p.key"
        class="preset-chip"
        @click="usePreset(p)"
      >{{ p.label }}</div>
    </div>

    <!-- 聊天区 -->
    <div ref="listEl" class="chat-list">
      <div
        v-for="(m, i) in messages"
        :key="i"
        class="msg"
        :class="m.role"
      >
        <div class="avatar" :class="m.role">{{ m.role === 'ai' ? 'AI' : '我' }}</div>
        <div class="bubble">
          <div class="msg-text">{{ m.text }}<span v-if="m.streaming" class="stream-caret"></span></div>

          <!-- 流式状态：工具调用 / 思考中 -->
          <div v-if="m.streaming && !m.text" class="stream-hint">
            <span v-if="m.tools && m.tools.length">正在{{ toolLabel(m.tools[m.tools.length - 1]) }}…</span>
            <span v-else>正在思考…</span>
          </div>
          <div v-else-if="m.streaming && m.tools && m.tools.length" class="stream-hint small">
            正在{{ toolLabel(m.tools[m.tools.length - 1]) }}…
          </div>

          <!-- 结构化卡片（流式 card 事件：方案/订单/店铺/支付/贺卡/生图/选项） -->
          <AdvisorCards
            v-for="(c, ci) in (m.cards || [])"
            :key="ci"
            :card="c"
            @buy="onCardBuy"
            @send="sendOption"
            @pay="onCardPay"
            @order="onCardOrder"
            @view-order="onViewOrder"
            @save-diy-plan="onSaveDiyPlan"
            @go-shop="onGoShop"
            @go-detail="onGoDetail"
          />

          <!-- 效果图（轮询任务回填） -->
          <div v-if="m.image" class="ai-effect">
            <FlowerImage :src="m.image" :emoji="'🌸'" class="ai-effect-img" />
          </div>

          <!-- DIY 方案卡（真实智能体 plan_card / tool_calls） -->
          <div v-if="m.plans && m.plans.length" class="ai-plans">
            <div
              v-for="plan in m.plans"
              :key="plan.id"
              class="ai-plan-card"
            >
              <FlowerImage :src="plan.image" :emoji="'💐'" class="ai-plan-image" />
              <div class="ai-plan-body">
                <div class="ai-plan-name">{{ plan.name }}</div>
                <div v-if="plan.desc" class="ai-plan-desc">{{ plan.desc }}</div>
                <div class="ai-plan-foot">
                  <span class="ai-plan-price">¥{{ yuan(plan.priceText) }}</span>
                  <span class="ai-plan-buy" @click="buyPlan(plan)">加入购物车</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 推荐商品（mock 兜底，跳详情/购买） -->
          <div v-if="m.products && m.products.length" class="ai-products">
            <div
              v-for="product in m.products"
              :key="product.id"
              class="ai-product-card"
              @click="goDetail(product)"
            >
              <FlowerImage :src="product.image" :emoji="'💐'" class="ai-product-image" />
              <div class="ai-product-info">
                <div class="ai-product-name">{{ product.name }}</div>
                <div class="ai-product-price">¥{{ yuan(product.priceText) }}</div>
              </div>
              <div class="ai-product-buy" @click.stop="buy(product)">立即购买</div>
            </div>
          </div>

          <!-- 选项 chips（真实智能体 dialog_options） -->
          <div v-if="m.options && m.options.length" class="ai-options">
            <div
              v-for="(opt, oi) in m.options"
              :key="oi"
              class="ai-option-chip"
              @click="sendOption(opt.value)"
            >{{ opt.label }}</div>
          </div>
        </div>
      </div>

    </div>

    <!-- 输入框 -->
    <div class="input-row" :style="{ bottom: 'calc(env(safe-area-inset-bottom))' }">
      <textarea
        v-model="inputText"
        class="chat-input"
        :auto-height="true"
        maxlength="160"
        rows="1"
        :placeholder="placeholder"
        @keydown.enter.exact.prevent="sendMessage"
      ></textarea>
      <div
        v-if="generating"
        class="send-btn stop"
        @click="stopGenerate"
      >停止</div>
      <div
        v-else
        class="send-btn"
        @click="sendMessage"
      >发送</div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import store, { addToCart, saveDiyPlan, yuan } from '@/store'
import AdvisorCards from '@/components/AdvisorCards.vue'
import { chatWithAdvisor, streamAdvisorChat, pollAgentTask, ADVISOR_PRESETS, AGENT_CONFIG } from '@/mock/api'
import { extractDiyPlan, isDiyScene } from '@/utils/extractDiyPlan'
import { toast } from '@/utils/toast'

const router = useRouter()

const presets = ADVISOR_PRESETS
const placeholder = '说说送花对象、关系和想表达的心情…'
const inputText = ref('')
const GREETING = {
  role: 'ai',
  text: '你好，我是你的专属花艺小助手 🌸 告诉我送花对象、预算和场景，我来帮你搭配一束刚刚好的花（还能生成效果图哦）。'
}
const messages = ref([{ ...GREETING }])
const generating = ref(false)
const sessionId = ref('')
const agentMode = ref('real') // 'real' = 已连接真实智能体；'demo' = 回退 mock 演示
const listEl = ref(null)
const abortCtl = ref(null) // 流式生成的中断控制器
const stopped = ref(false) // 用户主动点「停止」，避免中断后再发一次整段对话

// ===== 多会话管理 =====
const STORAGE_KEY = 'twd_advisor_convos'
const conversations = ref([])
const activeId = ref('')
const drawerOpen = ref(false)

function uid() {
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function makeConversation() {
  return {
    id: uid(),
    title: '新对话',
    messages: [{ ...GREETING }],
    sessionId: '',
    agentMode: 'real',
    updatedAt: Date.now()
  }
}

function saveConversations() {
  try {
    const data = conversations.value
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(c => ({
        id: c.id,
        title: c.title,
        messages: c.messages.slice(-40),
        sessionId: c.sessionId,
        agentMode: c.agentMode,
        updatedAt: c.updatedAt
      }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.slice(0, 30)))
  } catch (e) { /* 忽略存储异常 */ }
}

function loadConversations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length) {
        conversations.value = arr
        selectConversation(arr[0].id)
        return
      }
    }
  } catch (e) { /* 忽略损坏数据 */ }
  const c = makeConversation()
  conversations.value = [c]
  activeId.value = c.id
  messages.value = c.messages
}

function newConversation() {
  const c = makeConversation()
  conversations.value.unshift(c)
  activeId.value = c.id
  messages.value = c.messages
  sessionId.value = ''
  agentMode.value = 'real'
  drawerOpen.value = false
  saveConversations()
  scrollToBottom()
}

function selectConversation(id) {
  const c = conversations.value.find(x => x.id === id)
  if (!c) return
  activeId.value = id
  messages.value = c.messages
  sessionId.value = c.sessionId || ''
  agentMode.value = c.agentMode || 'real'
  drawerOpen.value = false
  scrollToBottom()
}

function deleteConversation(id) {
  const idx = conversations.value.findIndex(c => c.id === id)
  if (idx < 0) return
  conversations.value.splice(idx, 1)
  if (activeId.value === id) {
    if (conversations.value.length) selectConversation(conversations.value[0].id)
    else newConversation()
  }
  saveConversations()
}

function renameConversation(id) {
  const c = conversations.value.find(x => x.id === id)
  if (!c) return
  const name = (typeof window !== 'undefined' && window.prompt)
    ? window.prompt('给对话重命名', c.title)
    : null
  if (name && name.trim()) {
    c.title = name.trim()
    saveConversations()
  }
}

function lastText(c) {
  const msgs = c.messages.filter(m => m.role === 'user')
  if (msgs.length) return msgs[msgs.length - 1].text
  return '还没有消息'
}

function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

function usePreset(p) {
  inputText.value = p.prompt
  sendMessage()
}

function sendOption(value) {
  if (generating.value) return
  inputText.value = value
  sendMessage()
}

// 工具名 → 中文提示（流式 tool_call 事件）
function toolLabel(name) {
  const n = String(name || '')
  if (/db|query|entity|product|shop/i.test(n)) return '查询花库'
  if (/image|draw|effect|pic|greet/i.test(n)) return '生成效果图'
  if (/order/i.test(n)) return '创建订单'
  if (/pay/i.test(n)) return '准备支付'
  return '调用工具'
}

async function sendMessage() {
  const text = (inputText.value || '').trim()
  if (!text || generating.value) return
  const conv = conversations.value.find(c => c.id === activeId.value)
  messages.value.push({ role: 'user', text })
  if (conv && conv.title === '新对话') conv.title = text.slice(0, 12)
  inputText.value = ''
  generating.value = true
  scrollToBottom()

  // 先占位一条 AI 消息，流式的文本/卡片陆续填进来
  const idx = messages.value.length
  messages.value.push({ role: 'ai', text: '', cards: [], tools: [], streaming: true, image: '', poll: null })
  const cur = () => messages.value[idx]
  const set = patch => Object.assign(cur(), patch)

  abortCtl.value = new AbortController()
  stopped.value = false
  let gotAny = false
  try {
    const r = await streamAdvisorChat({
      message: text,
      shopId: 'default',
      sessionId: sessionId.value,
      signal: abortCtl.value.signal,
      onEvent: ev => {
        if (!cur()) return
        if (ev.event === 'text') {
          const c = (ev.data && (ev.data.content || ev.data.text || ev.data.delta)) || ''
          if (c) {
            set({ text: cur().text + c })
            gotAny = true
            scrollToBottom()
          }
        } else if (ev.event === 'card') {
          const ui = (ev.data && ev.data.ui) || 'text'
          const data = (ev.data && ev.data.data) || {}
          cur().cards.push({ ui, data })
          gotAny = true
          scrollToBottom()
        } else if (ev.event === 'tool_call') {
          const name = ev.data && ev.data.name
          if (name && !cur().tools.includes(name)) cur().tools.push(name)
          scrollToBottom()
        } else if (ev.event === 'done') {
          if (ev.data && ev.data.session_id) sessionId.value = ev.data.session_id
          attachDiyPlan(cur())
        }
      }
    })

    // 兜底：若平台没发 done（异常中断等），流结束后再尝试一次（幂等）
    attachDiyPlan(cur())

    if (r && (r.ok || r.gotAny)) {
      agentMode.value = 'real'
      if (r.sessionId) sessionId.value = r.sessionId
    } else if (!stopped.value) {
      // 流式不可用（无 key / 不支持 / 网络问题）→ 回退整段对话（含 mock 演示）
      const result = await chatWithAdvisor({
        message: text,
        shopId: 'default',
        sessionId: sessionId.value
      })
      agentMode.value = result.mock ? 'demo' : 'real'
      sessionId.value = result.sessionId || sessionId.value
      set({
        text: result.reply,
        plans: result.plans || [],
        products: result.products || [],
        options: result.options || [],
        poll: result.poll || null
      })
      const poll = cur().poll
      if (poll) {
        pollAgentTask(poll, img => { if (cur()) cur().image = img })
      }
    }
  } catch (e) {
    set({ text: cur().text || '抱歉，刚刚网络有点小波动，换个说法再试试？' })
  } finally {
    set({ streaming: false })
    generating.value = false
    abortCtl.value = null
    if (conv) {
      conv.sessionId = sessionId.value
      conv.agentMode = agentMode.value
      conv.updatedAt = Date.now()
      saveConversations()
    }
    scrollToBottom()
  }
}

function stopGenerate() {
  stopped.value = true
  if (abortCtl.value) {
    abortCtl.value.abort()
    abortCtl.value = null
  }
  const last = messages.value[messages.value.length - 1]
  if (last && last.streaming) last.streaming = false
  generating.value = false
  toast('已停止生成')
}

// ===== 卡片交互 =====
// 方案卡：加入购物车 / 立即购买
function onCardBuy({ item, mode }) {
  if (!item) return
  addToCart({
    id: item.id,
    name: item.name,
    subtitle: item.desc || '',
    price: Math.round((Number(item.price) || 0) * 100),
    image: item.image || '',
    shopId: item.shopId || 'default',
    quantity: 1
  })
  if (mode === 'now') {
    toast('已加入购物车，去结算')
    setTimeout(() => router.push({ name: 'checkout' }), 280)
  } else {
    toast('已加入购物车')
  }
}

// 订单卡：确认下单 → 把明细加进购物车并跳结算（有订单号则直接看订单）
function onCardOrder(order) {
  if (!order) return
  if (order.order_id) {
    router.push('/order/' + encodeURIComponent(order.order_id))
    return
  }
  const items = order.items || []
  if (!items.length) { toast('订单明细为空'); return }
  items.forEach(it => {
    addToCart({
      id: 'agent_' + (it.name || 'flower'),
      name: it.name || '定制花束',
      price: Math.round((Number(it.price) || 0) * 100),
      image: '',
      shopId: 'default',
      quantity: it.qty || 1
    })
  })
  toast('已加入购物车，去结算')
  setTimeout(() => router.push({ name: 'checkout' }), 280)
}

function onViewOrder(id) {
  if (id) router.push('/order/' + encodeURIComponent(id))
  else router.push('/orders')
}

// 店铺卡：进店 → 店铺详情页（shop_id 为平台真实店铺 id）
function onGoShop(shop) {
  const id = shop && String(shop.shop_id || shop.id || '').trim()
  if (!id) { toast('店铺信息缺失'); return }
  router.push({ name: 'shop-detail', params: { id } })
}

// 方案卡：看花束详情（plan id 为真实商品 id，可与商详页直通）
function onGoDetail(p) {
  if (!p || !p.id) { toast('商品信息缺失'); return }
  router.push({ name: 'detail', params: { id: p.id } })
}

// 支付：跳订单列表（待支付 tab），后续接平台收银台
function onCardPay(pay) {
  if (pay && pay.order_id) router.push('/order/' + encodeURIComponent(pay.order_id))
  else router.push('/orders')
}

function goDetail(product) {
  if (product && product.id) router.push({ name: 'detail', params: { id: product.id } })
}

function buy(product) {
  if (!product || !product.id) return
  addToCart({
    id: product.id,
    name: product.name,
    price: Math.round((product.price || 0) * 100),
    image: product.image || '',
    shopId: product.shopId || 'default',
    quantity: 1
  })
  toast('已加入购物车')
  setTimeout(() => router.push({ name: 'checkout' }), 280)
}

// DIY 方案加入购物车（自定义条目，价格已是「元」）
function buyPlan(plan) {
  if (!plan || !plan.id) return
  addToCart({
    id: 'plan_' + plan.id,
    name: plan.name,
    price: Math.round((plan.price || 0) * 100),
    image: plan.image || '',
    shopId: plan.shopId || 'default',
    quantity: 1
  })
  toast('方案已加入购物车')
  setTimeout(() => router.push({ name: 'checkout' }), 280)
}

// DIY 场景兜底：平台调了 generate_diy_plan 但没 emit card 事件时，
// 从流完的文本里启发式提取方案并合成 diy_plan_card（平台发了卡则跳过，不重复）
function attachDiyPlan(msg) {
  if (!msg || !msg.text) return
  if ((msg.cards || []).some(c => c.ui === 'diy_plan_card')) return
  if (!isDiyScene(msg.text, msg.tools)) return
  let plan = null
  try { plan = extractDiyPlan(msg.text) } catch (e) { plan = null }
  if (!plan) return
  if (!msg.cards) msg.cards = []
  msg.cards.push({ ui: 'diy_plan_card', data: plan })
  scrollToBottom()
}

// DIY 方案「保存到我的方案」 → store（localStorage 持久化，见「我的 → 我的方案」）
function onSaveDiyPlan(plan) {
  if (!plan || !plan.id) { toast('方案数据缺失，保存失败'); return }
  const ok = saveDiyPlan({
    id: plan.id,
    name: plan.name,
    desc: plan.desc,
    price: plan.price,
    image: plan.image,
    materials: plan.materials,
    budget: plan.budget,
    careTips: plan.careTips,
    greeting: plan.greeting,
    skillLevel: plan.skillLevel,
    suitableFor: plan.suitableFor
  })
  toast(ok ? '已保存到「我的方案」' : '保存失败，请稍后再试')
}


onMounted(() => {
  loadConversations()
  scrollToBottom()
})
</script>

<style scoped lang="scss">
.advisor-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-sizing: border-box;
}

.advisor-status {
  display: flex;
  align-items: center;
  gap: rpx(12);
  padding: rpx(12) rpx(24);
  font-size: rpx(24);
  color: #8a8276;
  background: #faf8f4;
  border-bottom: 1rpx solid #f1eee9;
}
.status-dot {
  width: rpx(14);
  height: rpx(14);
  border-radius: 50%;
  background: #c9c2b6;
  flex: none;
  &.real { background: #38b865; }
  &.demo { background: #f0a93a; }
}
.status-text { flex: 1; }
.new-chat {
  flex: none;
  color: #d98a3a;
  font-weight: 600;
  padding: rpx(6) rpx(16);
  border: 1rpx solid #f0c98a;
  border-radius: rpx(999);
}

/* 对话管理入口 + 抽屉 */
.conv-toggle {
  flex: none;
  width: rpx(48);
  height: rpx(48);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(40);
  line-height: 1;
  color: #5c524d;
  border-radius: rpx(10);
  background: #fff;
  border: 1rpx solid #ebe6df;
}
.conv-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1100;
}
.conv-drawer {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  width: rpx(580);
  max-width: 82%;
  background: #fff;
  z-index: 1101;
  transform: translateX(-100%);
  transition: transform 0.28s ease;
  display: flex;
  flex-direction: column;
  box-shadow: rpx(8) 0 rpx(40) rgba(0, 0, 0, 0.12);
}
.conv-drawer.open { transform: translateX(0); }
.conv-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: rpx(28) rpx(28) rpx(20);
  font-size: rpx(32);
  font-weight: 700;
  color: var(--text-primary);
  border-bottom: 1rpx solid #f1eee9;
}
.conv-drawer-close { font-size: rpx(34); color: var(--text-light); }
.conv-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: rpx(12) rpx(16);
}
.conv-item {
  display: flex;
  align-items: center;
  gap: rpx(12);
  padding: rpx(22) rpx(18);
  border-radius: rpx(16);
  cursor: pointer;
  &:active { background: #faf8f4; }
  &.active { background: #fdeee9; }
}
.conv-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: rpx(6);
}
.conv-item-title {
  font-size: rpx(28);
  font-weight: 600;
  color: var(--text-primary);
}
.conv-item-preview {
  font-size: rpx(22);
  color: var(--text-light);
}
.conv-item-actions {
  display: flex;
  align-items: center;
  gap: rpx(10);
  flex-shrink: 0;
}
.conv-act {
  width: rpx(56);
  height: rpx(56);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(28);
  border-radius: rpx(12);
  background: #f7f5f2;
  color: #8a8276;
}
.conv-del { color: #d9534f; }
.conv-new {
  flex-shrink: 0;
  margin: rpx(16) rpx(16) calc(#{rpx(16)} + env(safe-area-inset-bottom));
  height: rpx(88);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: rpx(16);
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(30);
  font-weight: 600;
}

.preset-scroll {
  display: flex;
  gap: rpx(14);
  padding: rpx(16) rpx(24);
  overflow-x: auto;
  white-space: nowrap;
  border-bottom: 1rpx solid #f1eee9;
  -webkit-overflow-scrolling: touch;
}
.preset-chip {
  flex: 0 0 auto;
  padding: rpx(12) rpx(22);
  border-radius: 999rpx;
  color: #5c524d;
  background: #fff;
  font-size: rpx(24);
  border: 1rpx solid #ebe6df;
  cursor: pointer;
}

.chat-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: rpx(20) rpx(24) calc(#{rpx(140)} + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}

.msg {
  display: flex;
  gap: rpx(14);
  margin-bottom: rpx(24);
}
.msg.user {
  flex-direction: row-reverse;
}
.avatar {
  width: rpx(56);
  height: rpx(56);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: rpx(22);
  font-weight: 900;
}
.avatar.ai {
  background: #eef8f6;
  color: #168278;
}
.avatar.user {
  background: #fff0f0;
  color: #d94f4b;
}
.bubble {
  max-width: 76vw;
  padding: rpx(18) rpx(24);
  border-radius: rpx(26);
  background: #f8f6f3;
  color: #4e4641;
  font-size: rpx(27);
  line-height: 1.55;
  word-break: break-word;
}
.msg.user .bubble {
  background: #d9efff;
  color: #1f2937;
}
.msg-text {
  white-space: pre-wrap;
}

/* 流式输出：光标 + 状态提示 */
.stream-caret {
  display: inline-block;
  width: rpx(3);
  height: rpx(26);
  margin-left: rpx(4);
  vertical-align: text-bottom;
  background: #c9a06a;
  animation: caret-blink 1s steps(1) infinite;
}
@keyframes caret-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.stream-hint {
  margin-top: rpx(8);
  font-size: rpx(22);
  color: #a39a93;
  &.small { margin-top: rpx(6); font-size: rpx(20); }
}

/* 效果图 */
.ai-effect {
  margin-top: rpx(14);
  border-radius: rpx(16);
  overflow: hidden;
  background: #f4f1ed;
}
.ai-effect-img {
  width: 100%;
  height: rpx(280);
  display: block;
  :deep(img) { width: 100%; height: 100%; object-fit: cover; }
}

/* DIY 方案卡 */
.ai-plans { margin-top: rpx(16); }
.ai-plan-card {
  display: flex;
  gap: rpx(14);
  padding: rpx(14);
  margin-top: rpx(10);
  border: 1rpx solid #ebe6df;
  border-radius: rpx(16);
  background: #fff;
}
.ai-plan-image {
  width: rpx(120);
  height: rpx(120);
  flex: 0 0 rpx(120);
  border-radius: rpx(12);
  background: #f4f1ed;
  overflow: hidden;
  :deep(img) { width: 100%; height: 100%; object-fit: cover; }
}
.ai-plan-body {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.ai-plan-name {
  color: #332c28;
  font-size: rpx(25);
  font-weight: 700;
}
.ai-plan-desc {
  margin-top: rpx(6);
  color: #8d8580;
  font-size: rpx(22);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ai-plan-foot {
  margin-top: auto;
  padding-top: rpx(10);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ai-plan-price {
  color: #e8615d;
  font-size: rpx(27);
  font-weight: 800;
}
.ai-plan-buy {
  padding: rpx(10) rpx(18);
  border-radius: 999rpx;
  background: #251f1c;
  color: #fff;
  font-size: rpx(22);
  font-weight: 700;
  cursor: pointer;
}

/* 推荐商品（mock） */
.ai-products { margin-top: rpx(16); }
.ai-product-card {
  display: flex;
  align-items: center;
  gap: rpx(14);
  padding: rpx(14);
  margin-top: rpx(10);
  border: 1rpx solid #ebe6df;
  border-radius: rpx(16);
  background: #fff;
  cursor: pointer;
}
.ai-product-image {
  width: rpx(104);
  height: rpx(104);
  flex: 0 0 rpx(104);
  border-radius: rpx(12);
  background: #f4f1ed;
  overflow: hidden;
  :deep(img) { width: 100%; height: 100%; object-fit: cover; }
}
.ai-product-info { min-width: 0; flex: 1; }
.ai-product-name {
  display: block;
  overflow: hidden;
  color: #332c28;
  font-size: rpx(25);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-product-price {
  display: block;
  margin-top: rpx(8);
  color: #e8615d;
  font-size: rpx(25);
  font-weight: 800;
}
.ai-product-buy {
  flex: 0 0 auto;
  padding: rpx(10) rpx(14);
  border-radius: 999rpx;
  background: #251f1c;
  color: #fff;
  font-size: rpx(22);
  font-weight: 700;
}

/* 选项 chips */
.ai-options {
  margin-top: rpx(14);
  display: flex;
  flex-wrap: wrap;
  gap: rpx(12);
}
.ai-option-chip {
  padding: rpx(10) rpx(20);
  border-radius: 999rpx;
  background: #fff;
  border: 1rpx solid #e3dcd3;
  color: #5c524d;
  font-size: rpx(23);
  cursor: pointer;
}


.input-row {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  width: 1rem;
  z-index: 999;
  display: flex;
  align-items: flex-end;
  gap: rpx(8);
  padding: rpx(10) rpx(22) calc(#{rpx(14)} + env(safe-area-inset-bottom));
  background: #fff;
  box-sizing: border-box;
  border-top: 1rpx solid #f1eee9;
}
.chat-input {
  flex: 1;
  min-height: rpx(72);
  max-height: rpx(150);
  padding: rpx(18) rpx(22);
  border: none;
  border-radius: rpx(20);
  background: #f8f6f3;
  color: #332c28;
  font-size: rpx(26);
  line-height: 1.4;
  resize: none;
  outline: none;
  font-family: inherit;
}
.send-btn {
  width: rpx(112);
  height: rpx(72);
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #251f1c;
  color: #fff;
  font-size: rpx(26);
  font-weight: 800;
  cursor: pointer;
  flex-shrink: 0;
}
.send-btn.stop {
  background: #8a8276;
}
</style>
