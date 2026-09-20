<template>
  <div class="advisor-page">
    <!-- 报头：返回 + 品牌 + 连接状态 + 对话管理 + 新对话 -->
    <header class="masthead">
      <button class="back-btn" aria-label="返回" @click="goBack">
        <span class="arrow-back"></span>
      </button>

      <div class="brand">
        <svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 34V15" />
          <path d="M20 21c0-5.2 3.6-9.4 8.4-10.4C27.4 16.4 24.4 20.2 20 21z" />
          <path d="M20 26.5c0-4.2-2.9-7.5-6.8-8.3.6 4.5 3.2 7.6 6.8 8.3z" />
          <circle class="fill" cx="20" cy="10.4" r="3.1" />
        </svg>
        <span class="brand-text">
          <span class="brand-title">花艺小助手</span>
          <span class="brand-sub">Botanical Atelier</span>
        </span>
      </div>

      <div class="masthead-actions">
        <span class="status" :class="agentMode">
          <i></i><span class="status-text">{{ agentMode === 'real' ? '已连接' : '演示模式' }}</span>
        </span>
        <button class="icon-btn" aria-label="对话管理" @click="drawerOpen = true">≡</button>
        <button class="btn-ghost" @click="newConversation">新对话</button>
      </div>
    </header>

    <!-- 🔧 诊断面板（仅 URL 带 ?diag=1 时出现；正常访问看不到，不影响线上）
         用途：把「消息 + 卡片」的真实数据结构直接摊在页面上，
         排查「卡片拿不到效果图」这类问题时不必靠猜。 -->
    <div v-if="diagOn" class="diag">
      <div class="diag-h">DIAG · 消息 {{ messages.length }} 条 · 版本 0062f37+</div>
      <div v-for="(m, i) in messages" :key="'dg' + i" class="diag-m">
        <div class="diag-r">
          <b>#{{ i }} {{ m.role }}</b>
          <span>text:{{ (m.text || '').length }}字</span>
          <span>img:{{ m.image ? ('有 ' + shortUrl(m.image)) : '无' }}</span>
          <span>st:{{ m.imageStatus || '-' }}</span>
          <span>poll:{{ m.poll || '-' }}</span>
          <span>cards:{{ (m.cards || []).length }}</span>
        </div>
        <div v-for="(c, ci) in (m.cards || [])" :key="'dc' + ci" class="diag-c">
          [{{ ci }}] ui={{ c.ui }} · keys={{ keysOf(c.data) }}
          <br />cardTask={{ (c.data && c.data.task_id) || '-' }} cardPoll={{ (c.data && c.data.poll) || '-' }}
          <template v-if="c.data && c.data.plans">
            <br />plans={{ c.data.plans.length }} · diyCount={{ diyCount(c.data.plans) }}
          </template>
        </div>
      </div>
    </div>

    <!-- 对话管理抽屉 -->
    <div class="conv-mask" v-if="drawerOpen" @click="drawerOpen = false"></div>
    <aside class="conv-drawer" :class="{ open: drawerOpen }">
      <div class="conv-drawer-head">
        <span class="drawer-head-text">
          <span class="kicker">Conversations</span>
          <span class="drawer-title">对话管理</span>
        </span>
        <button class="icon-btn" aria-label="关闭" @click="drawerOpen = false">✕</button>
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
            <span class="conv-act conv-del" @click.stop="deleteConversation(c.id)" title="删除">✕</span>
          </div>
        </div>
        <div v-if="!conversations.length" class="conv-empty">还没有对话记录</div>
      </div>
      <button class="conv-new" @click="newConversation">＋ 新建对话</button>
    </aside>

    <!-- 场景预设 -->
    <div v-if="presets.length" class="chips-row">
      <button
        v-for="p in presets"
        :key="p.key"
        class="chip-btn"
        @click="usePreset(p)"
      >{{ p.label }}</button>
    </div>

    <!-- 对话区：唯一的滚动容器 -->
    <main ref="listEl" class="stage">
      <div class="log">
        <!-- 欢迎区（仅新对话时显示，对齐官方 demo 的 hero）-->
        <section v-if="showHero" class="hero">
          <div class="hero-kicker">Botanical Atelier</div>
          <h2>把<em>心意</em>，交给一束刚好的花</h2>
          <p>说说送给谁、什么场合、预算多少 —— 我来帮你挑花材、定配色、配包装，还能直接生成效果图看看成品的样子。</p>
          <div class="caps">
            <span class="cap">花材搭配</span>
            <span class="cap">配色包装</span>
            <span class="cap">预算核算</span>
            <span class="cap">效果图</span>
            <span class="cap">贺卡文案</span>
          </div>
        </section>

        <div
          v-for="(m, i) in visibleMessages"
          :key="i"
          class="rise"
          :class="m.role === 'user' ? 'msg-user' : 'msg-bot'"
        >
          <!-- 用户消息：右侧墨绿气泡 -->
          <div v-if="m.role === 'user'" class="bubble">{{ m.text }}</div>

          <!-- 助手消息：无气泡排版 -->
          <template v-else>
            <div class="who">花艺小助手</div>

            <div v-if="m.text" class="say">{{ m.text }}<span v-if="m.streaming" class="caret"></span></div>

            <!-- AI 生成内容标识（《人工智能生成合成内容标识办法》/ GB 45438-2025，平台随 done 下发）-->
            <div v-if="m.role !== 'user' && m.aiGenerated" class="aigc-tag">
              {{ m.disclosure || '本内容由 AI 生成，仅供参考' }}
            </div>

            <!-- 流式状态：思考中 / 工具调用 -->
            <div v-if="m.streaming && !m.text" class="thinking-line">
              <span class="think-dots"><i></i><i></i><i></i></span>
              <span>{{ (m.tools && m.tools.length)
                ? ('正在' + toolLabel(m.tools[m.tools.length - 1]) + '…')
                : (m.thinkText || '正在构思…') }}</span>
              <span class="think-elapsed">{{ m.thinkElapsed || 0 }}s</span>
            </div>
            <div v-else-if="m.streaming && m.tools && m.tools.length" class="tool-line">
              正在{{ toolLabel(m.tools[m.tools.length - 1]) }}…
            </div>

            <!-- 结构化卡片（方案/订单/店铺/支付/贺卡/生图/选项） -->
            <AdvisorCards
              v-for="(c, ci) in (m.cards || [])"
              :key="ci"
              :card="c"
              :msg-image="m.image || ''"
              :msg-image-status="m.imageStatus || ''"
              @buy="onCardBuy"
              @send="sendOption"
              @pay="onCardPay"
              @order="onCardOrder"
              @view-order="onViewOrder"
              @save-diy-plan="onSaveDiyPlan"
              @go-shop="onGoShop"
              @go-detail="onGoDetail"
            />

            <!-- 城市过滤提示：商家只做同城配送，别城的商品已隐藏 -->
            <p v-if="m.cityFiltered" class="city-filter-note">
              已隐藏 {{ m.cityFiltered }} 件不在「{{ store.city }}」的商品（花店只做同城配送）
            </p>

            <!-- 效果图（轮询回填；生成中显示 3:4 骨架 + 计时，出图后淡入）
                 ⚠️ 消息里已有 DIY 方案卡时不再单独渲染：图会填进该卡的封面，
                    否则同一张效果图会出现两次（卡片内一次、消息末尾一次）。 -->
            <figure v-if="m.image && !diyCoverReady(m)" class="frame">
              <img
                v-if="!m.imageBroken"
                class="frame-img"
                :class="{ on: m.imageOn }"
                :src="m.image"
                alt="效果图"
                @load="m.imageOn = true"
                @error="m.imageBroken = true"
              />
              <div v-else class="frame-pad">
                <p class="plain">效果图加载失败，可稍后重试。</p>
              </div>
              <figcaption class="frame-cap"><span>效果图</span><b>AI 生成</b></figcaption>
            </figure>
            <figure v-else-if="m.imageStatus === 'processing' && !diyCoverReady(m)" class="frame">
              <div class="frame-pad">
                <div class="shimmer"></div>
                <p class="plain frame-tip">
                  正在生成效果图…<span class="think-elapsed">{{ m.imageElapsed || 0 }}s</span>
                </p>
              </div>
              <figcaption class="frame-cap"><span>效果图</span><b>生成中</b></figcaption>
            </figure>
            <p v-else-if="m.imageError && !diyCoverReady(m)" class="frame-error">{{ m.imageError }}</p>

            <!-- DIY 方案卡（真实智能体 plan_card / tool_calls） -->
            <div v-if="m.plans && m.plans.length" class="prods">
              <article
                v-for="plan in m.plans"
                :key="plan.id"
                class="prod"
              >
                <div class="prod-img">
                  <FlowerImage :src="plan.image" :emoji="'💐'" class="prod-img-inner" />
                </div>
                <div class="prod-body">
                  <div class="prod-name">{{ plan.name }}</div>
                  <div v-if="plan.desc" class="prod-sub">{{ plan.desc }}</div>
                  <div class="prod-foot">
                    <span class="prod-price">¥{{ yuan(plan.priceText) }}</span>
                    <button class="act" @click="buyPlan(plan)">立即结算</button>
                  </div>
                </div>
              </article>
            </div>

            <!-- 推荐商品（mock 兜底，跳详情/购买） -->
            <div v-if="m.products && m.products.length" class="prods">
              <article
                v-for="product in m.products"
                :key="product.id"
                class="prod"
                @click="goDetail(product)"
              >
                <div class="prod-img">
                  <FlowerImage :src="product.image" :emoji="'💐'" class="prod-img-inner" />
                </div>
                <div class="prod-body">
                  <div class="prod-name">{{ product.name }}</div>
                  <div class="prod-foot">
                    <span class="prod-price">¥{{ yuan(product.priceText) }}</span>
                    <button class="act" @click.stop="buy(product)">立即结算</button>
                  </div>
                </div>
              </article>
            </div>

            <!-- 选项 chips（真实智能体 dialog_options） -->
            <div v-if="m.options && m.options.length" class="ai-options">
              <button
                v-for="(opt, oi) in m.options"
                :key="oi"
                class="opt-chip"
                @click="sendOption(opt.value)"
              >{{ opt.label }}</button>
            </div>
          </template>
        </div>
      </div>
    </main>

    <!-- 输入区 -->
    <footer class="composer">
      <div class="input-row">
        <div class="input-wrap">
          <textarea
            v-model="inputText"
            class="chat-input"
            :auto-height="true"
            maxlength="160"
            rows="1"
            :placeholder="placeholder"
            @keydown.enter.exact.prevent="sendMessage"
          ></textarea>
        </div>
        <button
          v-if="generating"
          class="send stop"
          aria-label="停止生成"
          @click="stopGenerate"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6.2" y="6.2" width="7.6" height="7.6" rx="1.6" /></svg>
        </button>
        <button
          v-else
          class="send"
          aria-label="发送"
          :disabled="!inputText.trim()"
          @click="sendMessage"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11" /><path d="M10.6 5.6 15 10l-4.4 4.4" /></svg>
        </button>
      </div>
      <p class="foot-note">花材与价格以店家实际确认为准 · <b>跳舞兰</b></p>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import store, { addToCart, saveDiyPlan, yuan } from '@/store'
import AdvisorCards from '@/components/AdvisorCards.vue'
import {
  chatWithAdvisor, streamAdvisorChat, pollAgentTask, normalizeAgentAssetUrl,
  isAgentRateLimited, ADVISOR_PRESETS, AGENT_CONFIG, listAgentConversations, fetchAgentMessages
} from '@/mock/api'
import { extractDiyPlan, isDiyScene } from '@/utils/extractDiyPlan'
import { mergeAgentMessages, slimMessage, extractImageTaskId } from '@/utils/advisorHistory'
import { ensureCity, cityShopIds, filterAgentMessageByCity } from '@/utils/city'
import { toast } from '@/utils/toast'

const router = useRouter()
const route = useRoute()

/**
 * 入口上下文 —— 由「从哪个页面进来」决定，透传给智能体。
 *
 * 为什么要传：智能体的 entry 语义（flora `agent/ports.py` 2026-09-10 定）
 *   product = 从商品详情页进 → 锁定该商品所属店铺
 *   shop    = 从店铺详情页进 → 锁定该店铺
 *   home    = 首页/搜索/分类等   → 全平台模式，可跨店推荐
 *
 * 以前这里把 shopId 写死成 'default'（flora 会规范化成 None = 未锁店），
 * 导致「从商品详情页点 AI」也走全平台模式 → 智能体推荐的是全平台 1855 款商品，
 * 其中跨城的会被前端城市过滤整卡剔除 → 用户看到 AI 说「点卡片下单」却一张卡都没有。
 * 传对上下文后，锁店推荐的商品天然与本城一致，卡片能正常显示和下单。
 */
const entryCtx = {
  entry: String(route.query.entry || '').trim() || undefined,
  shopId: String(route.query.shop_id || '').trim() || undefined,
  productId: String(route.query.product_id || '').trim() || undefined,
  productTitle: String(route.query.product_title || '').trim() || undefined
}

/**
 * 本次对话该「锁定哪家店」。
 *
 * 从商品/店铺页进来时已有明确店铺（entryCtx.shopId），直接用。
 * 从首页、搜索、分类等入口进来时**也要锁定本城的一家门店** —— 否则智能体走全平台模式，
 * 按平台总部目录（1855 款、跨 11 城）推荐，跨城的商品会被城市过滤剔除，卡片整批消失
 * （用户看到「点卡片下单」却一张卡都没有）。
 *
 * 为什么锁单店不损失选择：实测福州 2 家门店的商品**完全同名**（98 款 vs 98 款，同名 98），
 * 其余 10 个城市各只有 1 家店 —— 所以锁一家店看到的款式集合＝全城款式集合。
 * 代价仅剩「多家店时只展示其中一家的价格」。
 *
 * 只传 shop_id、不传 entry 即可：flora 的 normalize_entry 会按上下文推断成 'shop'（锁店）。
 */
let resolvedShopId = null
async function resolveAgentShopId() {
  if (entryCtx.shopId) return entryCtx.shopId
  if (resolvedShopId !== null) return resolvedShopId
  try {
    const city = store.city || (await ensureCity())
    const ids = await cityShopIds(city)
    resolvedShopId = [...ids][0] || ''
  } catch (e) {
    resolvedShopId = '' // 拿不到门店 → 交回 default（全平台），由城市过滤兜底
  }
  return resolvedShopId
}

/** 报头返回（替代原来的 NavBar 返回；无历史时回首页） */
const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'home' })
}

const presets = ADVISOR_PRESETS
const placeholder = '说说送花对象、关系和想表达的心情…'
const inputText = ref('')
const GREETING = {
  role: 'ai',
  // 标记为问候语：既用于「新对话时渲染欢迎区」，也让它**不参与**本地/平台历史合并
  greeting: true,
  text: '你好，我是你的专属花艺小助手 🌸 告诉我送花对象、预算和场景，我来帮你搭配一束刚刚好的花（还能生成效果图哦）。'
}
const messages = ref([{ ...GREETING }])

/** 思考阶段轮播文案（对齐官方 demo 的 THINK_STAGES，让等待过程有反馈）*/
const THINK_STAGES = [
  '正在理解你的需求…',
  '正在检索花材与寓意…',
  '正在挑选配色与包装…',
  '正在核算预算与支数…',
  '正在斟酌文案…'
]
let thinkTimer = null
let thinkIdx = 0

/** 还没产生任何实际对话 → 显示欢迎区 */
const showHero = computed(() => messages.value.filter(m => m && !m.greeting).length === 0)
/** 问候语由欢迎区承担，始终不单独渲染（否则发完第一条消息它会突然冒出来）*/
const visibleMessages = computed(() => messages.value.filter(m => m && !m.greeting))
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

// 落盘瘦身（slimMessage）与历史合并（mergeAgentMessages）见 @/utils/advisorHistory

function saveConversations() {
  try {
    const data = conversations.value
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(c => ({
        id: c.id,
        title: c.title,
        messages: (c.messages || []).slice(-40).map(slimMessage),
        sessionId: c.sessionId,
        agentMode: c.agentMode,
        updatedAt: c.updatedAt
      }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.slice(0, 30)))
  } catch (e) {
    // 🔴 以前这里静默吞异常：超配额时写入失败，用户只看到「卡片没了」却毫无线索。
    console.warn('[advisor] 会话本地保存失败（可能超出存储配额）：', e && e.name, e && e.message)
  }
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
  resumeImageTasks(c.messages) // 接着查没出图的效果图任务
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
  messages.value.push({
    role: 'ai', text: '', cards: [], tools: [], streaming: true,
    image: '', poll: null, thinkText: THINK_STAGES[0], thinkElapsed: 0
  })
  const cur = () => messages.value[idx]
  const set = patch => Object.assign(cur(), patch)
  startThinking(cur())

  abortCtl.value = new AbortController()
  stopped.value = false
  let gotAny = false
  try {
    const r = await streamAdvisorChat({
      message: text,
      shopId: (await resolveAgentShopId()) || 'default',
      sessionId: sessionId.value,
      entry: entryCtx.entry,
      productId: entryCtx.productId,
      productTitle: entryCtx.productTitle,
      signal: abortCtl.value.signal,
      onEvent: ev => {
        if (!cur()) return
        // 平台 2026-09-18 起改为**真 token 流**：逐字推 `text_delta`；并新增 `text_rollback`
        // （模型流式中途改成调工具 → 前面已推的文字作废，必须撤回，否则页面残留内部独白）。
        // 🔴 平台只在「一次都没推过」时才退回整段 `text`，所以**必须**处理 `text_delta`，
        //    否则用户会看到「完全没有文字、只有卡片」。
        if (ev.event === 'text_delta' || ev.event === 'text') {
          const c = (ev.data && (ev.data.content || ev.data.text || ev.data.delta)) || ''
          if (c) {
            set({ text: cur().text + c })
            gotAny = true
            scrollToBottom()
          }
        } else if (ev.event === 'text_rollback') {
          // 撤回本次已推的文字（那段是模型内部独白，不该给用户看）
          set({ text: '' })
          scrollToBottom()
        } else if (ev.event === 'card') {
          const ui = (ev.data && ev.data.ui) || 'text'
          const data = (ev.data && ev.data.data) || {}
          cur().cards.push({ ui, data })
          // 效果图任务：按 /ui-contract，前端要拿 data.poll 去轮询 /tasks/{task_id}。
          // ⚠️ 实测平台的 task_id / poll 是**挂在 plan_card 的 data 上**的（并不是独立的 image_task 卡片），
          //    所以判断条件放宽为「data 里带了 poll / task_id / result_url」。
          if (data && (data.poll || data.task_id || data.result_url)) startImagePoll(cur(), data)
          gotAny = true
          scrollToBottom()
        } else if (ev.event === 'tool_call') {
          const name = ev.data && ev.data.name
          if (name && !cur().tools.includes(name)) cur().tools.push(name)
          scrollToBottom()
        } else if (ev.event === 'done') {
          const d = ev.data || {}
          if (d.session_id) sessionId.value = d.session_id
          // 🔴 `done.reply` 是**权威终稿**：平台在它上面跑过清理链（危险标签转义、独白替换、
          //    卡片要点追加），而流式推的是模型原始输出。所以这里以 reply 为准覆盖已累加的文字。
          if (typeof d.reply === 'string' && d.reply.trim()) set({ text: d.reply })
          // AIGC 标识（GB 45438-2025）随 done 下发，落到消息上供界面展示
          if (d.ai_generated != null) set({ aiGenerated: !!d.ai_generated })
          if (d.content_disclosure) set({ disclosure: String(d.content_disclosure) })
          attachDiyPlan(cur())
          attachImageTaskFromText(cur())
          applyCityFilter(cur())
        }
      }
    })

    // 兜底：若平台没发 done（异常中断等），流结束后再尝试一次（幂等）
    attachDiyPlan(cur())
    attachImageTaskFromText(cur())
    applyCityFilter(cur())

    if (r && (r.ok || r.gotAny)) {
      agentMode.value = 'real'
      if (r.sessionId) sessionId.value = r.sessionId
    } else if (r && r.rateLimited) {
      // 🔴 限流 / 服务繁忙：**不许回退 mock**（否则会显示假回复并把顶部切成「演示模式」，
      //    用户看到的是"功能坏了"）。如实提示，模式保持不变。
      agentMode.value = 'real'
      set({ text: cur().text || '当前咨询的人有点多，稍等一会儿再问我吧。' })
      toast('当前咨询较多，请稍后再试')
    } else if (!stopped.value) {
      // 流式不可用（无 key / 不支持 / 网络问题）→ 回退整段对话（含 mock 演示）
      let result = null
      try {
        result = await chatWithAdvisor({
          message: text,
          shopId: (await resolveAgentShopId()) || 'default',
          sessionId: sessionId.value,
          entry: entryCtx.entry,
          productId: entryCtx.productId,
          productTitle: entryCtx.productTitle
        })
      } catch (e) {
        if (isAgentRateLimited(e)) {
          agentMode.value = 'real'
          set({ text: cur().text || '当前咨询的人有点多，稍等一会儿再问我吧。' })
          toast('当前咨询较多，请稍后再试')
        } else {
          throw e
        }
      }
      if (result) {
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
        if (poll) startImagePoll(cur()) // 统一走同一条轮询逻辑（含状态/失败处理）
        applyCityFilter(cur())
      }
    }
  } catch (e) {
    if (isAgentRateLimited(e)) {
      agentMode.value = 'real'
      set({ text: cur().text || '当前咨询的人有点多，稍等一会儿再问我吧。' })
      toast('当前咨询较多，请稍后再试')
    } else {
      set({ text: cur().text || '抱歉，刚刚网络有点小波动，换个说法再试试？' })
    }
  } finally {
    stopThinking()
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
// 方案卡两个按钮的语义必须可区分：
//   加购（mode='cart'）→ 只进购物车，留在对话里继续挑（可凑单/一起结算）
//   结算（mode='now'） → 进购物车并直接跳结算页，省一步
// 统一的加购入口：入车失败（无 id / 无有效价格）必须**如实告知**，
// 不能再像以前那样无条件 toast「已加入购物车」——那正是审计 P0-3 的现象。
function addToCartOrWarn(payload, okMsg) {
  if (addToCart(payload)) { toast(okMsg); return true }
  toast('该方案暂无报价，无法直接下单，请先咨询商家')
  return false
}

function onCardBuy({ item, mode }) {
  if (!item) return
  const ok = addToCartOrWarn({
    id: item.id,
    name: item.name,
    subtitle: item.desc || '',
    price: Math.round((Number(item.price) || 0) * 100),
    image: item.image || '',
    shopId: item.shopId || 'default',
    quantity: 1
  }, mode === 'now' ? '已加入购物车，正在去结算' : '已加入购物车，可以继续挑')
  if (ok && mode === 'now') setTimeout(() => router.push({ name: 'checkout' }), 280)
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
  let added = 0
  items.forEach(it => {
    if (addToCart({
      id: 'agent_' + (it.name || 'flower'),
      name: it.name || '定制花束',
      price: Math.round((Number(it.price) || 0) * 100),
      image: '',
      shopId: 'default',
      quantity: it.qty || 1
    })) added++
  })
  if (!added) { toast('订单明细缺少报价，无法直接下单'); return }
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
  const ok = addToCartOrWarn({
    id: product.id,
    name: product.name,
    price: Math.round((product.price || 0) * 100),
    image: product.image || '',
    shopId: product.shopId || 'default',
    quantity: 1
  }, '已加入购物车')
  if (ok) setTimeout(() => router.push({ name: 'checkout' }), 280)
}

// DIY 方案加入购物车（自定义条目，价格已是「元」）
// ⚠️ DIY 方案的 `price` 实测常为 null（真实价格只存在于 `estimated_price` 字符串，
//    如「约 300 元」）→ 加购会被拒，这里如实提示，不再假报成功。
function buyPlan(plan) {
  if (!plan || !plan.id) return
  const ok = addToCartOrWarn({
    id: 'plan_' + plan.id,
    name: plan.name,
    price: Math.round((plan.price || 0) * 100),
    image: plan.image || '',
    shopId: plan.shopId || 'default',
    quantity: 1
  }, '方案已加入购物车')
  if (ok) setTimeout(() => router.push({ name: 'checkout' }), 280)
}

// DIY 场景兜底：平台调了 generate_diy_plan 但没 emit card 事件时，
/**
 * 按当前城市过滤本消息的商品卡。
 * 智能体的商品来自平台全量商品库（跨 11 个城市），而商家只做同城配送 ——
 * 不筛选就会出现「AI 推荐了福州的花、深圳用户买了、付款后被商家拒单」。
 * DIY 方案卡不涉及配送城市，不受影响（实现见 utils/city.js）。
 */
async function applyCityFilter(msg) {
  if (!msg) return
  try {
    await ensureCity()
    const dropped = await filterAgentMessageByCity(msg)
    if (dropped > 0) msg.cityFiltered = dropped
  } catch (e) {
    console.warn('[advisor] 城市过滤失败：', e && e.message)
  }
}

// 从流完的文本里启发式提取方案并合成 diy_plan_card（平台发了卡则跳过，不重复）
function attachDiyPlan(msg) {
  if (!msg || !msg.text) return
  // 🔴 平台已下发 DIY 数据（plan_card 里含 diy:true）时**不要再从正文提取**：
  //    否则同一个方案会被渲染两次（截图里正是重复的），且文本猜出来的版本细节远少于平台结构化数据。
  if (hasDiyCard(msg)) return
  if (!isDiyScene(msg.text, msg.tools)) return
  let plan = null
  try { plan = extractDiyPlan(msg.text) } catch (e) { plan = null }
  if (!plan) return
  if (!msg.cards) msg.cards = []
  // 🔴 生图任务信息（task_id / poll）挂在**同一消息内 plan_card 的 data 顶层**，
  //    而这张兜底卡是另一个对象，不借用的话它的 hasTask 恒为 false ——
  //    封面会一直显示静态「定制花束」，既不提示"生成中"，也让人以为图不会来
  //    （用户截图里那张正是这个状态）。
  const taskSrc = (msg.cards || []).find(c => c && c.data && (c.data.task_id || c.data.poll))
  if (taskSrc) {
    plan.task_id = plan.task_id || taskSrc.data.task_id
    plan.poll = plan.poll || taskSrc.data.poll
  }
  msg.cards.push({ ui: 'diy_plan_card', data: plan })
  scrollToBottom()
}

/**
 * 效果图任务：按平台 /ui-contract 的 image_task 契约轮询。
 * data 形如 { task_id, poll: '/tasks/xxx', result_url }；
 * status：processing 生成中 / done 成功（取 result_url）/ failed 失败（读 error）。
 */
/** 思考阶段轮播 + 计时（对齐官方 demo；结束由 stopThinking 收尾）*/
function startThinking(msg) {
  stopThinking()
  thinkIdx = 0
  const t0 = Date.now()
  const tick = () => {
    if (!msg || !msg.streaming) return
    msg.thinkText = THINK_STAGES[Math.min(thinkIdx, THINK_STAGES.length - 1)]
    msg.thinkElapsed = Math.round((Date.now() - t0) / 1000)
    thinkIdx++
  }
  tick()
  thinkTimer = setInterval(tick, 2000)
}

function stopThinking() {
  if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null }
}

/** 消息里是否已有 DIY 方案卡（平台 plan_card 里的 diy 项，或前端兜底合成的 diy_plan_card） */
function hasDiyCard(msg) {
  return (Array.isArray(msg && msg.cards) ? msg.cards : []).some(c =>
    c && (c.ui === 'diy_plan_card' ||
      (c.ui === 'plan_card' && Array.isArray(c.data && c.data.plans) &&
        c.data.plans.some(p => p && p.diy))))
}

/**
 * 效果图回填：消息级的图要**同时**写进 DIY 卡封面。
 * 否则卡片一直停在「效果图生成中」，真图却另外渲染在消息末尾 ——
 * 用户看到的就是「DIY 方案的图片没放在对应位置」。
 * 平台把生图任务挂在 plan_card 顶层、方案本体在 plans[i]，所以两处都要写。
 */
function injectImageToCards(msg, img) {
  if (!msg || !img) return
  for (const c of (msg.cards || [])) {
    if (!c || !c.data) continue
    if (c.ui === 'diy_plan_card') c.data.effect_image_url = img
    if (c.ui === 'image_task') c.data.result_url = img
    if (c.ui === 'plan_card' && Array.isArray(c.data.plans)) {
      for (const p of c.data.plans) if (p && p.diy) p.effect_image_url = img
    }
  }
}

/**
 * 这条消息里的 DIY 方案卡**是否已经能显示效果图**。
 * 用它（而不是「有没有 DIY 卡」）来决定要不要隐藏消息末尾的独立 frame：
 * 🔴 曾经写成「有 DIY 卡就隐藏」，结果当那张卡拿不到图时（旧会话里前端兜底合成的
 *    `diy_plan_card` 没有 task_id、或数据在落盘时被截断），图就被藏死了 ——
 *    用户看到的现象正是「效果图没有同步到 DIY 方案的位置」。
 * 语义：**图会显示在卡里 → 不重复渲染 frame；不会 → 独立 frame 兜住，图不丢**。
 */
function diyCoverReady(msg) {
  if (!hasDiyCard(msg)) return false
  // Advisor 轮询到的图会经 :msg-image 直接传给 DIY 卡渲染 → 卡里必然有图
  if (msg && msg.image) return true
  return (Array.isArray(msg && msg.cards) ? msg.cards : []).some(c => {
    if (!c || !c.data) return false
    if (c.ui === 'diy_plan_card') return !!(c.data.effect_image_url || c.data.image_url || c.data.image)
    if (c.ui === 'plan_card' && Array.isArray(c.data.plans)) {
      return c.data.plans.some(p => p && p.diy && (p.effect_image_url || p.image_url || p.image))
    }
    return false
  })
}

function startImagePoll(msg, data) {
  if (!msg || msg.image) return
  // 没有 poll 就从卡片/文本里取；已有 poll（刷新后从本地恢复）则直接续查
  if (!msg.poll) {
    const d = data || {}
    // result_url 可能是相对路径（/generated/xxx.png），必须归一化，否则 img 会打到前端域名上
    if (d.result_url) {
      msg.image = normalizeAgentAssetUrl(d.result_url)
      injectImageToCards(msg, msg.image)
      return
    }
    const taskId = String(d.task_id || '').trim()
    const poll = String(d.poll || '').trim() || (taskId ? ('/tasks/' + taskId) : '')
    if (!poll) return
    msg.poll = poll
  }
  if (msg._imagePolling) return // 同一条消息不重复轮询
  msg._imagePolling = true
  msg.imageStatus = msg.imageStatus || 'processing'
  // 生成计时：生图通常要十几秒，显示「已等待 N 秒」比干等体验好
  const t0 = Date.now()
  msg.imageElapsed = 0
  const clock = setInterval(() => { msg.imageElapsed = Math.round((Date.now() - t0) / 1000) }, 1000)
  Promise.resolve(pollAgentTask(msg.poll, {
    onImage: img => {
      const u = normalizeAgentAssetUrl(img)
      msg.image = u
      msg.imageStatus = 'done'
      injectImageToCards(msg, u)
    },
    onStatus: (st, err) => {
      msg.imageStatus = st
      if (st === 'failed') msg.imageError = err || '效果图生成失败'
    }
  })).finally(() => clearInterval(clock))
}

/** 刷新 / 切换会话后：把「已提交但还没出图」的效果图任务接着轮询（poll 已随消息落盘）*/
function resumeImageTasks(list) {
  for (const m of (list || [])) {
    if (m && m.poll && !m.image) startImagePoll(m)
  }
}

/** 兜底：平台没下发 image_task 卡片时，从正文的任务编号自行去查（见 advisorHistory.extractImageTaskId）*/
function attachImageTaskFromText(msg) {
  if (!msg || msg.poll || msg.image) return
  const taskId = extractImageTaskId(msg.text)
  if (!taskId) return
  startImagePoll(msg, { task_id: taskId })
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


// 历史合并（mergeAgentMessages）见 @/utils/advisorHistory
// 🔴 铁律：平台只存文本，**合并时绝不能整体覆盖本地消息**，否则卡片全丢。

/**
 * 跨设备同步：智能体平台按账号（user_id）存会话，登录后把平台上的会话拉回来合并。
 * 命中规则用 sessionId（= 平台的 conversation id），因此可续聊、不会重复。
 * 失败只记录日志，不影响本地使用（本地 localStorage 仍是离线兜底）。
 */
async function syncFromAgent() {
  if (!AGENT_CONFIG.ready) return
  if (!(store.isLogged && store.token)) return
  try {
    const list = await listAgentConversations()
    if (!Array.isArray(list) || !list.length) return
    const bySession = new Map(conversations.value.map(c => [c.sessionId, c]))
    let added = 0
    for (const item of list.slice(0, 20)) {
      const sid = String((item && item.id) || '')
      if (!sid) continue
      let msgs = []
      try {
        msgs = await fetchAgentMessages(sid)
      } catch (e) {
        continue // 单个会话拉取失败不影响其它
      }
      if (!msgs.length) continue
      const updatedAt = Date.parse((item && item.updated_at) || '') || Date.now()
      const exist = bySession.get(sid)
      if (exist) {
        // 本机已有 → **合并**：保留本地卡片，只把平台多出来的新消息补到末尾。
        // （以前这里是 exist.messages = [{GREETING}, ...msgs] 整体覆盖 → 卡片全丢）
        const merged = mergeAgentMessages(exist.messages, msgs)
        exist.title = item.title || exist.title
        if (merged.appended) exist.messages = [{ ...GREETING }, ...merged.messages]
        exist.updatedAt = Math.max(exist.updatedAt || 0, updatedAt)
      } else {
        conversations.value.push({
          id: 'p_' + sid,
          title: item.title || '历史对话',
          messages: [{ ...GREETING }, ...msgs],
          sessionId: sid,
          agentMode: 'real',
          updatedAt
        })
        added++
      }
    }
    conversations.value.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    const cur = conversations.value.find(c => c.id === activeId.value)
    if (cur) {
      messages.value = cur.messages
      sessionId.value = cur.sessionId || ''
    }
    saveConversations()
    if (added) toast(`已同步 ${added} 条历史对话`)
  } catch (e) {
    console.warn('[advisor] 智能体会话同步失败（不影响使用）：', e && e.message)
  }
}

/** 🔧 诊断开关：URL 带 ?diag=1 才渲染诊断面板（排查用，不影响正常用户） */
const diagOn = ref(false)
const keysOf = (o) => Object.keys(o || {}).join(',')
const diyCount = (arr) => (Array.isArray(arr) ? arr.filter(p => p && p.diy).length : 0)
/** 诊断面板用：只显示地址尾部，便于发现 /agent/agent/... 这类拼接错误 */
const shortUrl = (u) => { const t = String(u || ''); return t.length > 44 ? ('…' + t.slice(-44)) : t }

onMounted(() => {
  diagOn.value = /[?&]diag=1/.test(location.search)
  loadConversations()
  scrollToBottom()
  syncFromAgent()
})
</script>

<style scoped lang="scss">
/* 🔧 诊断面板（仅 ?diag=1）—— 深色等宽小字，便于截图比对 */
.diag {
  flex: none;
  max-height: 46vh;
  overflow: auto;
  padding: rpx(16) rpx(20);
  background: #1e1c19;
  color: #e8e2d6;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: rpx(19);
  line-height: 1.55;
  border-bottom: rpx(3) solid #a58449;
  -webkit-overflow-scrolling: touch;
}
.diag-h { color: #c8ac79; margin-bottom: rpx(10); letter-spacing: 0.08em; }
.diag-m {
  margin-bottom: rpx(12);
  padding-bottom: rpx(10);
  border-bottom: 1rpx dashed rgba(255, 255, 255, 0.16);
}
.diag-r { display: flex; gap: rpx(14); flex-wrap: wrap; }
.diag-r b { color: #fff; }
.diag-c {
  margin-top: rpx(6);
  padding-left: rpx(12);
  border-left: rpx(3) solid #a58449;
  color: #d8cfae;
  word-break: break-all;
}
/* ══════════════════════════════════════════════════════════════
   AI 花艺顾问 —— 「花艺标本册」风格（对齐 api.tiaowulan.com/demo）
   暖象牙纸底 · 墨绿主色 · 黄铜细线 · 衬线标题 + 无衬线正文
   全部 token 收在本页作用域，不影响其它页面。
   尺寸：demo 的 px 按 2× 映射为 rpx（1rem = 750rpx = 容器宽）
   ══════════════════════════════════════════════════════════════ */
.advisor-page {
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
  --font-num: Georgia, "Times New Roman", var(--font-body, inherit);

  /* ⚠️ 关键：固定视口高度 + 不整页滚动。
     原来 min-height:100vh 导致 chat-list 不产生内部滚动、整页变长 → 输入框错位/内容溢出。 */
  position: relative;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  color: var(--ink);
  font-family: var(--font-body);
  line-height: 1.7;
  background-color: var(--paper);
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.34'/%3E%3C/svg%3E"),
    radial-gradient(120% 58% at 8% -8%, #fcf8f0 0%, transparent 58%),
    radial-gradient(92% 48% at 104% -2%, #efe8db 0%, transparent 52%);
  background-blend-mode: multiply, normal, normal;
}

/* ── 报头（承接原 NavBar + 状态栏）── */
.masthead {
  flex: none;
  display: flex;
  align-items: center;
  gap: rpx(12);
  padding: rpx(24) rpx(40) rpx(20);
  border-bottom: 1rpx solid var(--line-2);
  position: relative;
  background: transparent;
}
.masthead::after {
  content: "";
  position: absolute;
  left: rpx(40);
  right: rpx(40);
  bottom: rpx(-5);
  height: 1rpx;
  background: var(--line);
}
.back-btn {
  flex: none;
  width: rpx(58);
  height: rpx(58);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid var(--line-2);
  border-radius: rpx(22);
  background: var(--paper-2);
  cursor: pointer;
  transition: 0.22s;
}
.back-btn:active { background: #edf1ec; border-color: var(--moss-3); }
.back-btn .arrow-back {
  width: rpx(18);
  height: rpx(18);
  border-left-width: rpx(4);
  border-bottom-width: rpx(4);
  border-color: var(--moss);
  margin-left: rpx(-4);
}

/* ⚠️ 报头是 flex 行且子项 nowrap：必须给 brand / brand-text 显式 min-width:0
   并允许省略号，否则窄容器下文字会溢出盒子、压到右侧按钮上。 */
.brand {
  display: flex;
  align-items: center;
  gap: rpx(12);
  min-width: 0;
  flex: 1 1 auto;
}
.mark { flex: none; width: rpx(50); height: rpx(50); }
.mark path,
.mark circle { stroke: var(--moss); fill: none; stroke-width: 1.25; stroke-linecap: round; }
.mark .fill { fill: var(--brass); stroke: none; }
.brand-text { display: flex; flex-direction: column; min-width: 0; }
.brand-title {
  font-family: var(--font-display);
  font-size: rpx(32);
  font-weight: 600;
  letter-spacing: 0.05em;
  line-height: 1.2;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.brand-sub {
  font-family: var(--font-num);
  font-size: rpx(16);
  color: var(--ink-3);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-top: rpx(4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.masthead-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: rpx(10);
}
.status {
  display: inline-flex;
  align-items: center;
  gap: rpx(10);
  font-size: rpx(19);
  color: var(--ink-2);
  letter-spacing: 0.04em;
  padding: rpx(8) rpx(16);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(999);
  background: var(--paper-2);
  white-space: nowrap;
}
.status i {
  width: rpx(11);
  height: rpx(11);
  border-radius: 50%;
  background: var(--ink-3);
  flex: none;
  transition: background 0.3s;
}
.status.real i { background: var(--moss-3); }
.status.demo i { background: var(--brass); }
.icon-btn {
  width: rpx(56);
  height: rpx(56);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(30);
  line-height: 1;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(22);
  cursor: pointer;
  transition: 0.22s;
}
.icon-btn:active { color: var(--moss); border-color: var(--moss-3); background: #edf1ec; }
.btn-ghost {
  font-family: inherit;
  font-size: rpx(21);
  letter-spacing: 0.04em;
  color: var(--ink-2);
  background: none;
  border: 1rpx solid var(--line-2);
  border-radius: rpx(999);
  padding: rpx(10) rpx(18);
  cursor: pointer;
  transition: 0.22s;
  white-space: nowrap;
}
.btn-ghost:active { color: var(--moss); border-color: var(--moss-3); background: var(--paper-2); }

/* ── 对话管理抽屉（absolute：跟随容器，不用 fixed/vw）── */
.conv-mask {
  position: absolute;
  inset: 0;
  background: rgba(30, 28, 25, 0.42);
  z-index: 20;
  animation: adv-fade 0.24s ease-out;
}
.conv-drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 78%;
  max-width: rpx(600);
  z-index: 21;
  display: flex;
  flex-direction: column;
  background: var(--paper-2);
  border-right: 1rpx solid var(--line-2);
  box-shadow: rpx(10) 0 rpx(60) rgba(30, 28, 25, 0.14);
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.2, 0.7, 0.3, 1);
}
.conv-drawer.open { transform: translateX(0); }
.conv-drawer-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: rpx(16);
  padding: rpx(36) rpx(32) rpx(24);
  border-bottom: 1rpx solid var(--line);
}
.drawer-head-text { display: flex; flex-direction: column; min-width: 0; }
.kicker {
  font-family: var(--font-num);
  font-size: rpx(18);
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--brass);
}
.drawer-title {
  font-family: var(--font-display);
  font-size: rpx(34);
  font-weight: 600;
  color: var(--ink);
  margin-top: rpx(4);
  letter-spacing: 0.04em;
}
.conv-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: rpx(16) rpx(18);
}
.conv-item {
  display: flex;
  align-items: center;
  gap: rpx(16);
  padding: rpx(22) rpx(20);
  border-radius: rpx(24);
  border: 1rpx solid transparent;
  cursor: pointer;
  transition: 0.2s;
}
.conv-item:active { background: var(--paper-3); }
.conv-item.active {
  background: #edf1ec;
  border-color: var(--line-2);
}
.conv-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: rpx(6);
}
.conv-item-title {
  font-size: rpx(26);
  font-weight: 500;
  color: var(--ink);
}
.conv-item-preview {
  font-size: rpx(21);
  color: var(--ink-3);
}
.conv-item-actions {
  display: flex;
  align-items: center;
  gap: rpx(10);
  flex-shrink: 0;
}
.conv-act {
  width: rpx(54);
  height: rpx(54);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(24);
  border-radius: rpx(20);
  background: var(--paper-3);
  color: var(--ink-3);
  cursor: pointer;
}
.conv-del { color: var(--danger); }
.conv-empty {
  padding: rpx(40) rpx(20);
  text-align: center;
  font-size: rpx(23);
  color: var(--ink-3);
}
.conv-new {
  flex: none;
  font-family: inherit;
  font-size: rpx(27);
  font-weight: 500;
  letter-spacing: 0.04em;
  margin: rpx(18) rpx(20) calc(#{rpx(20)} + env(safe-area-inset-bottom));
  min-height: rpx(86);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid var(--moss);
  border-radius: rpx(999);
  background: var(--moss);
  color: #f4f2ea;
  cursor: pointer;
  transition: 0.22s;
}
.conv-new:active { background: var(--moss-2); border-color: var(--moss-2); }

/* ── 场景预设 ── */
.chips-row {
  flex: none;
  display: flex;
  gap: rpx(14);
  padding: rpx(20) rpx(40);
  overflow-x: auto;
  white-space: nowrap;
  border-bottom: 1rpx solid var(--line);
  scrollbar-width: none;
}
.chips-row::-webkit-scrollbar { display: none; }
.chip-btn {
  flex: 0 0 auto;
  font-family: inherit;
  font-size: rpx(22);
  letter-spacing: 0.03em;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(999);
  padding: rpx(10) rpx(26);
  cursor: pointer;
  transition: 0.2s;
}
.chip-btn:active { color: var(--moss); border-color: var(--moss-3); background: #edf1ec; }

/* ── 对话区：唯一滚动容器 ── */
.stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: rpx(46) rpx(40) rpx(28);
  scrollbar-width: thin;
}
.stage::-webkit-scrollbar { width: rpx(10); }
.stage::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: rpx(999); }
.log {
  display: flex;
  flex-direction: column;
  gap: rpx(46);
}

.rise { animation: adv-rise 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
@keyframes adv-rise {
  from { opacity: 0; transform: translateY(rpx(18)); }
  to { opacity: 1; transform: none; }
}
@keyframes adv-fade { from { opacity: 0; } to { opacity: 1; } }

/* 用户消息 */
.msg-user {
  align-self: flex-end;
  /* ⚠️ 原来写的是 76vw —— 宽屏下会远超容器宽（容器被限制在 ≤480px）导致横向溢出，这里改用容器百分比 */
  max-width: 82%;
}
.msg-user .bubble {
  background: var(--moss);
  color: #f3f1ea;
  padding: rpx(22) rpx(32);
  border-radius: rpx(30) rpx(30) rpx(8) rpx(30);
  font-size: rpx(30);
  line-height: 1.6;
  box-shadow: 0 rpx(2) rpx(4) rgba(30, 28, 25, 0.06), 0 rpx(8) rpx(22) rgba(30, 28, 25, 0.06);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 助手消息：无气泡，靠左侧黄铜竖线排版 */
.msg-bot {
  max-width: 100%;
  padding-left: rpx(28);
  border-left: rpx(4) solid var(--brass-2);
}
.msg-bot .who {
  font-family: var(--font-num);
  font-size: rpx(21);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--brass);
  margin-bottom: rpx(14);
}
.msg-bot .say {
  font-size: rpx(31);
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 流式光标 */
.caret {
  display: inline-block;
  width: rpx(3);
  height: rpx(28);
  margin-left: rpx(4);
  vertical-align: text-bottom;
  background: var(--brass);
  animation: adv-caret 1s steps(1) infinite;
}
@keyframes adv-caret {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

/* 思考中 */
.thinking-line,
.tool-line {
  display: flex;
  align-items: center;
  gap: rpx(20);
  color: var(--ink-2);
  font-size: rpx(28);
}
.tool-line { margin-top: rpx(14); font-size: rpx(22); color: var(--ink-3); }
/* AI 生成内容标识（合规要求，随消息常驻，弱化处理但必须可见） */
.aigc-tag {
  margin-top: rpx(12);
  font-size: rpx(20);
  color: var(--ink-3);
  letter-spacing: 0.04em;
  opacity: 0.85;
}
.think-dots { display: inline-flex; gap: rpx(8); flex: none; }
.think-dots i {
  width: rpx(10);
  height: rpx(10);
  border-radius: 50%;
  background: var(--brass);
  animation: adv-dot 1.25s ease-in-out infinite;
}
.think-dots i:nth-child(2) { animation-delay: 0.18s; }
.think-dots i:nth-child(3) { animation-delay: 0.36s; }
@keyframes adv-dot {
  0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(rpx(-6)); }
}
/* 已等待秒数（对齐 demo 的 think-elapsed）*/
.think-elapsed {
  font-family: var(--font-num);
  font-size: rpx(23);
  color: var(--ink-3);
  letter-spacing: 0.08em;
  flex: none;
}

/* ── 欢迎区（新对话时显示，对齐官方 demo 的 hero）── */
.hero { padding: rpx(16) 0 rpx(8); }
.hero-kicker {
  font-family: var(--font-num);
  font-size: rpx(21);
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--brass);
  margin-bottom: rpx(24);
}
.hero h2 {
  font-family: var(--font-display);
  font-size: rpx(62);
  font-weight: 600;
  line-height: 1.42;
  letter-spacing: 0.02em;
  color: var(--ink);
}
.hero h2 em {
  font-style: normal;
  color: var(--moss);
  border-bottom: rpx(4) solid var(--brass-2);
  padding-bottom: rpx(4);
}
.hero p {
  font-size: rpx(28);
  color: var(--ink-2);
  margin-top: rpx(30);
  line-height: 1.85;
}
.caps {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(16);
  margin-top: rpx(40);
}
.cap {
  font-size: rpx(23);
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1rpx solid var(--line);
  padding: rpx(10) rpx(24);
  border-radius: rpx(999);
  letter-spacing: 0.03em;
}

/* ── 效果图 ── */
/* 生成的图是 3:4 竖构图；移动端撑满消息区（对齐官方 demo），桌面端也不会变成巨幅 */
.frame {
  margin: rpx(30) auto 0;
  max-width: 100%;
  border: 1rpx solid var(--line-2);
  border-radius: rpx(28);
  overflow: hidden;
  background: var(--paper-2);
  box-shadow: 0 rpx(4) rpx(8) rgba(30, 28, 25, 0.05), 0 rpx(24) rpx(64) rgba(30, 28, 25, 0.07);
}
.frame-pad { padding: rpx(44); }
/* 出图后淡入（onload 才加 .on），避免半张图先闪出来 */
.frame-img {
  width: 100%;
  display: block;
  background: var(--paper-3);
  opacity: 0;
  transition: opacity 0.6s ease;
  &.on { opacity: 1; }
}
.frame-tip {
  margin-top: rpx(28);
  text-align: center;
  font-size: rpx(26);
  color: var(--ink-3);
}
/* 生成中的骨架屏（3:4 闪烁），比转圈更贴近最终版式 */
.shimmer {
  aspect-ratio: 3 / 4;
  border-radius: rpx(18);
  background: linear-gradient(100deg, #efeae0 20%, #f8f5ee 42%, #efeae0 64%);
  background-size: 220% 100%;
  animation: shimmer-move 1.6s linear infinite;
}
@keyframes shimmer-move {
  to { background-position: -220% 0; }
}
.frame-cap {
  padding: rpx(22) rpx(36);
  border-top: 1rpx solid var(--line);
  font-size: rpx(22);
  color: var(--ink-3);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: rpx(20);
  letter-spacing: 0.04em;
}
.frame-cap b { font-family: var(--font-num); color: var(--ink-2); font-weight: 500; }
.frame-error {
  margin: rpx(18) auto 0;
  max-width: 100%;
  font-size: rpx(24);
  color: var(--ink-3);
  text-align: center;
}

/* 城市过滤提示（别城商品已隐藏） */
/* ⚠️ 本页是「花艺标本册」自成体系配色（--paper / --ink / --brass），
   不要用全站的 --primary-* / --text-*（那套是粉色系），否则会冒出粉色块。
   这一条原先误用了 --primary-light(#FFF0F0)，在本页米底墨绿里非常刺眼。 */
.city-filter-note {
  margin: rpx(16) 0 0;
  padding: rpx(14) rpx(18);
  border-radius: rpx(12);
  background: var(--paper-3);
  border: rpx(2) solid var(--line);
  font-size: rpx(22);
  line-height: 1.55;
  color: var(--ink-2);
}

/* ── 商品横向滚动框（方案卡 / DIY 封面共用）──
   卡片固定宽度横向排列，一屏露出约 1.9 张 —— 末尾露半张即「可左右滑动」的天然提示。
   ⚠️ overflow-y 必须显式 hidden，否则浏览器会把 visible 提升为 auto（纵向也滚）；
      代价是卡片投影会被纵向裁掉，故用 padding-bottom + 等量负 margin 补偿。 */
.prods {
  margin-top: rpx(30);
  display: flex;
  flex-wrap: nowrap;
  gap: rpx(24);
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  padding-bottom: rpx(14);
  margin-bottom: rpx(-14);
}
.prods::-webkit-scrollbar { display: none; }
/* 触屏设备藏滚动条（靠末尾露半张卡提示可滑）；桌面/带指针设备必须显示出来，
   否则用鼠标的人没有任何「这里能滑」的线索。变量与 .stage 保持一致。 */
@media (hover: hover) and (pointer: fine) {
  .prods {
    scrollbar-width: thin;
    cursor: grab;
    padding-bottom: rpx(24);
    margin-bottom: rpx(-24);
  }
  .prods:active { cursor: grabbing; }
  .prods::-webkit-scrollbar { display: block; height: rpx(10); }
  .prods::-webkit-scrollbar-track { background: transparent; }
  .prods::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: rpx(999); }
}
.prods > .prod {
  flex: 0 0 rpx(320);
  scroll-snap-align: start;
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
/* ⚠️ 本页模板里的商品卡（mock 兜底那条路径）不走 AdvisorCards 组件，
   所以图片兜底的粉紫渐变要在本文件里改回纸色，改了组件里的没用。 */
.prod-img-inner,
.frame-img {
  background: var(--paper-3);
}
.prod-img-inner :deep(.f-image),
.prod-img-inner :deep(.f-image-fallback),
.frame-img :deep(.f-image),
.frame-img :deep(.f-image-fallback) {
  background: var(--paper-3);
}
.prod-body {
  padding: rpx(22) rpx(26) rpx(26);
  display: flex;
  flex-direction: column;
  gap: rpx(10);
  flex: 1;
  min-width: 0;
}
.prod-name {
  font-family: var(--font-display);
  font-size: rpx(30);
  line-height: 1.4;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prod-sub {
  font-size: rpx(22);
  color: var(--ink-3);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.prod-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: rpx(14);
  padding-top: rpx(12);
  flex-wrap: wrap;
}
.prod-price {
  font-family: var(--font-num);
  font-size: rpx(38);
  color: var(--moss);
  flex: none;
}

/* ── 按钮（demo 的 .act）── */
.act {
  font-family: inherit;
  font-size: rpx(23);
  letter-spacing: 0.04em;
  cursor: pointer;
  padding: rpx(12) rpx(26);
  border-radius: rpx(999);
  transition: 0.22s;
  border: 1rpx solid var(--moss);
  background: var(--moss);
  color: #f4f2ea;
  white-space: nowrap;
  flex: none;
}
.act:active { background: var(--moss-2); border-color: var(--moss-2); }
.act.ghost { background: none; color: var(--moss); border-color: var(--line-2); }
.act.ghost:active { background: #edf1ec; border-color: var(--moss-3); }

/* ── 选项 chips ── */
.ai-options {
  margin-top: rpx(24);
  display: flex;
  flex-wrap: wrap;
  gap: rpx(16);
}
.opt-chip {
  font-family: inherit;
  font-size: rpx(23);
  letter-spacing: 0.03em;
  color: var(--ink-2);
  background: var(--paper-2);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(999);
  padding: rpx(12) rpx(26);
  cursor: pointer;
  transition: 0.2s;
}
.opt-chip:active { color: var(--moss); border-color: var(--moss-3); background: #edf1ec; }

/* ── 输入区（在流内，不再 fixed）── */
.composer {
  flex: none;
  padding: rpx(22) rpx(40) calc(#{rpx(24)} + env(safe-area-inset-bottom));
  border-top: 1rpx solid var(--line-2);
  background: transparent;
}
.input-row {
  display: flex;
  gap: rpx(18);
  align-items: flex-end;
}
.input-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  background: var(--paper-2);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(32);
  padding: rpx(16) rpx(28);
  transition: 0.22s;
  box-shadow: 0 rpx(2) rpx(8) rgba(30, 28, 25, 0.04);
}
.input-wrap:focus-within {
  border-color: var(--moss-3);
  box-shadow: 0 0 0 rpx(6) rgba(107, 133, 116, 0.12);
}
.chat-input {
  flex: 1;
  width: 100%;
  font-family: inherit;
  font-size: rpx(30);
  line-height: 1.6;
  color: var(--ink);
  border: none;
  background: none;
  outline: none;
  resize: none;
  max-height: rpx(264);
  min-height: rpx(52);
  padding: 0;
}
.chat-input::placeholder { color: var(--ink-3); }
.send {
  flex: none;
  width: rpx(84);
  height: rpx(84);
  border-radius: rpx(26);
  border: 1rpx solid var(--moss);
  background: var(--moss);
  color: #f4f2ea;
  cursor: pointer;
  transition: 0.22s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.send:active:not(:disabled) { background: var(--moss-2); border-color: var(--moss-2); }
.send:disabled { opacity: 0.32; cursor: not-allowed; }
.send.stop { background: var(--ink-3); border-color: var(--ink-3); opacity: 1; }
.send svg {
  width: rpx(34);
  height: rpx(34);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.send.stop svg { fill: currentColor; stroke: none; }
.foot-note {
  font-size: rpx(21);
  color: var(--ink-3);
  text-align: center;
  margin: rpx(20) 0 0;
  letter-spacing: 0.04em;
  line-height: 1.6;
}
.foot-note b {
  color: var(--brass);
  font-weight: 400;
  letter-spacing: 0.16em;
  font-family: var(--font-display);
}

/* ── 窄屏 ──
   视口 ≤480 时容器宽 = 视口宽，所以这里的媒体查询与容器查询等价；
   桌面（视口 >480）容器恒为 480，走完整版式（实测宽度刚好放得下）。 */
@media (max-width: 430px) {
  /* 副标题是装饰性的，让位给标题；状态只留圆点，信息不丢 */
  .brand-sub { display: none; }
  .status-text { display: none; }
  .status { padding: rpx(8) rpx(10); }
  .masthead { padding-left: rpx(28); padding-right: rpx(28); }
  .chips-row,
  .stage,
  .composer { padding-left: rpx(28); padding-right: rpx(28); }
  .stage { padding-top: rpx(36); }
  .log { gap: rpx(38); }
  .msg-user { max-width: 88%; }
}
</style>
