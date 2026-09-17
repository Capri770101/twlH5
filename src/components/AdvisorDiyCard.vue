<template>
  <div class="diy-card">
    <!-- 封面：效果图 / 生成中 -->
    <div class="diy-cover">
      <img
        v-if="cover"
        class="diy-cover-img"
        :class="{ on: imgOn }"
        :src="cover"
        alt="效果图"
        @load="imgOn = true"
        @error="imgBroken = true"
      />
      <div v-else class="diy-cover-ph">
        <div v-if="pending && !imgBroken" class="shimmer"></div>
        <span class="ph-emoji" v-if="!pending || imgBroken">💐</span>
        <span class="ph-text">{{ imgBroken ? '效果图加载失败' : (pending ? '效果图生成中…' : '定制花束') }}</span>
      </div>
      <span v-if="cover" class="cover-cap">效果图 · AI 生成</span>
    </div>

    <!-- 报头 -->
    <div class="card-head">
      <div class="card-kicker">定制方案 · Bespoke</div>
      <div class="card-title">{{ d.name }}</div>
      <div v-if="d.desc" class="card-sub">{{ d.desc }}</div>
      <div class="chips" v-if="d.chips.length">
        <span v-for="c in d.chips" :key="c.text" class="chip" :class="{ brass: c.brass }">{{ c.text }}</span>
      </div>
    </div>

    <div class="card-body">
      <!-- 花材构成 -->
      <div v-if="d.mainFlowers.length || d.secRow" class="sect">
        <div class="sect-label"><span>花材构成</span></div>
        <div class="fl">
          <div v-for="(f, i) in d.mainFlowers" :key="'m' + i" class="fl-row">
            <span class="fl-name">{{ f.name }}</span>
            <span class="fl-out" v-if="f.inShop === false">该店暂无</span>
            <span class="fl-qty">×{{ f.qty }}{{ f.unit }}</span>
            <span v-if="f.language" class="fl-lang">{{ f.language }}</span>
          </div>
          <div v-if="d.secRow" class="fl-row">
            <span class="fl-sec"><b>配材 · 叶材</b>　{{ d.secRow }}</span>
          </div>
          <div v-if="d.unavailable.length" class="fl-warn">
            该店暂时没有：{{ d.unavailable.join('、') }}
            　·　方案里保留了这几样，下单前建议先跟门店确认现货，或让门店用相近花材替代
          </div>
        </div>
      </div>

      <!-- 配色 -->
      <div v-if="d.colorScheme.length" class="sect">
        <div class="sect-label"><span>配色</span></div>
        <div class="palette">
          <span v-for="c in d.colorScheme" :key="c" class="sw">
            <i :style="{ background: hexOfColor(c) }"></i>{{ c }}
          </span>
        </div>
      </div>

      <!-- 包装 -->
      <div v-if="d.packaging" class="sect">
        <div class="sect-label"><span>包装</span></div>
        <div class="plain">{{ d.packaging }}</div>
      </div>

      <!-- 花语与祝福 -->
      <div v-if="d.meaning" class="sect">
        <div class="sect-label"><span>花语与祝福</span></div>
        <div class="quote">{{ d.meaning }}</div>
      </div>

      <!-- 折叠：制作步骤 / 养护 / 注意 / 费用 -->
      <details v-if="d.steps.length" class="fold">
        <summary>制作步骤（{{ d.steps.length }} 步）</summary>
        <div class="inner">
          <ol class="steps"><li v-for="(s, i) in d.steps" :key="i">{{ s }}</li></ol>
        </div>
      </details>

      <details v-if="d.careTips" class="fold">
        <summary>养护提示</summary>
        <div class="inner"><div class="plain">{{ d.careTips }}</div></div>
      </details>

      <details v-if="d.caution" class="fold">
        <summary>注意事项</summary>
        <div class="inner"><div class="plain">{{ d.caution }}</div></div>
      </details>

      <details v-if="d.budgetRows.length || d.feeNote" class="fold">
        <summary>费用与支数明细</summary>
        <div class="inner">
          <div v-if="d.stemCount" class="plain stem-line">含：{{ d.stemCount }}</div>
          <div v-if="d.budgetRows.length" class="rows boxed">
            <div v-for="(b, i) in d.budgetRows" :key="i" class="row">
              <span class="row-name">
                {{ b.label }}
                <em v-if="b.detail" class="row-det">{{ b.detail }}</em>
              </span>
              <span class="row-num">¥{{ b.amount.toFixed(2) }}</span>
            </div>
            <div v-if="d.totalNum" class="row total">
              <span class="row-name">合计</span>
              <span class="row-num">¥{{ d.totalNum.toFixed(2) }}</span>
            </div>
          </div>
          <div v-if="d.feeNote" class="plain fee-note">{{ d.feeNote }}</div>
        </div>
      </details>

      <!-- 贺卡文案 -->
      <div v-if="d.greeting" class="sect">
        <div class="sect-label"><span>贺卡文案</span></div>
        <div class="quote">{{ d.greeting }}</div>
        <button class="copy-btn" @click="copy(d.greeting)">{{ copyHint || '一键复制' }}</button>
      </div>

      <!-- 价格 + 动作 -->
      <div class="price-bar">
        <span class="price-main">{{ d.priceText }}</span>
        <span class="price-side">参考报价 · 含手工与包装<br />实际以门店确认为准</span>
      </div>
      <div class="card-actions">
        <button class="act ghost" @click="$emit('send', '这个方案换个配色再给我一版')">换个配色</button>
        <button class="act" @click="$emit('save', d)">保存到我的方案</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { AGENT_CONFIG } from '@/mock/api'
import { normalizeDiyPlan, hexOfColor } from '@/utils/diyPlan'

const props = defineProps({
  /** 平台 plan_card.plans[i]（diy:true 的那一项）或 diy_plan_card 的 data */
  plan: { type: Object, default: () => ({}) },
  /** 外层 card.data（平台的 task_id / poll 挂在 plan_card 顶层） */
  cardTop: { type: Object, default: () => ({}) },
  /** 由 Advisor.vue 轮询后注入的效果图 URL（优先于 plan 自带字段） */
  image: { type: String, default: '' },
  /** 所属消息的生图状态（processing/done/failed）。
   *  兜底合成的卡自身没有 task_id，靠它也能正确显示「生成中」，不至于空着让人以为图不会来。 */
  imageStatus: { type: String, default: '' }
})
defineEmits(['save', 'send'])

const AISTORE_BASE = 'https://aistore.xiangbinmeigui.com'
function absImg(u) {
  const s = String(u || '')
  if (!s) return ''
  if (/^https?:/i.test(s)) return s
  if (s.startsWith('/uploads')) return AISTORE_BASE + s
  // 平台生成的效果图是相对路径 /generated/xxx.png，必须经 /agent 反代取
  if (s.startsWith('/generated') || s.startsWith('/tasks')) return AGENT_CONFIG.apiBase + s
  return s
}

/** 解析全部收敛在 utils/diyPlan.js（纯函数，可单测） */
const d = computed(() => normalizeDiyPlan(props.plan, props.cardTop))

/* ── 效果图 ── */
const imgOn = ref(false)
const imgBroken = ref(false)
const cover = computed(() => {
  if (imgBroken.value) return ''
  return absImg(props.image || d.value.coverImage)
})

/** 是否处于「正在等效果图」状态 —— 决定封面显示 shimmer + 「生成中…」 */
const pending = computed(() => d.value.hasTask || props.imageStatus === 'processing')

/* ── 复制 ── */
const copyHint = ref('')
let copyTimer = null
function copy(t) {
  const text = String(t || '')
  if (!text) return
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showHint('已复制'))
  } else {
    showHint('已复制：' + text.slice(0, 16))
  }
}
function showHint(t) {
  copyHint.value = t
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copyHint.value = '' }, 1500)
}
</script>

<style scoped lang="scss">
/* ══════════════════════════════════════════════════════════════
   DIY 定制方案卡 —— 「花艺标本册」风格（对齐 api.tiaowulan.com/demo 的 diyCard）
   自包含样式：该卡展示细节较多（花材/花语/配色/步骤/费用），单独成组件便于维护。
   ══════════════════════════════════════════════════════════════ */
.diy-card {
  --paper-2: #fdfbf7;
  --paper-3: #efeae0;
  --ink: #1e1c19;
  --ink-2: #5b554b;
  --ink-3: #8e877b;
  --moss: #2b4133;
  --brass: #a58449;
  --brass-2: #c8ac79;
  --line: #e4dcce;
  --line-2: #d3c8b4;
  --font-display: "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", "STSong", "SimSun", Georgia, serif;
  --font-num: Georgia, "Times New Roman", serif;
  margin-top: rpx(28);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(28);
  overflow: hidden;
  background: var(--paper-2);
  box-shadow: 0 rpx(4) rpx(10) rgba(30, 28, 25, 0.04), 0 rpx(20) rpx(56) rgba(30, 28, 25, 0.06);
}

/* ── 封面 ── */
.diy-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: var(--paper-3);
  overflow: hidden;
}
.diy-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transition: opacity 0.5s ease;
}
.diy-cover-img.on { opacity: 1; }
.diy-cover-ph {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: rpx(18);
}
.ph-emoji { font-size: rpx(64); opacity: 0.5; }
.ph-text {
  font-size: rpx(24);
  color: var(--ink-3);
  letter-spacing: 0.06em;
  position: relative;
}
.shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, rgba(255, 255, 255, 0) 20%, rgba(255, 255, 255, 0.65) 50%, rgba(255, 255, 255, 0) 80%);
  background-size: 220% 100%;
  animation: shimmer-move 1.8s linear infinite;
}
@keyframes shimmer-move {
  0% { background-position: 160% 0; }
  100% { background-position: -60% 0; }
}
.cover-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: rpx(16) rpx(30);
  font-family: var(--font-num);
  font-size: rpx(20);
  letter-spacing: 0.16em;
  color: var(--ink-2);
  background: linear-gradient(to top, rgba(253, 251, 247, 0.94), rgba(253, 251, 247, 0));
}

/* ── 报头 ── */
.card-head {
  padding: rpx(34) rpx(36) rpx(24);
  border-bottom: 1rpx solid var(--line);
}
.card-kicker {
  font-family: var(--font-num);
  font-size: rpx(20);
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--brass);
  margin-bottom: rpx(14);
}
.card-title {
  font-family: var(--font-display);
  font-size: rpx(42);
  font-weight: 600;
  letter-spacing: 0.05em;
  line-height: 1.35;
  color: var(--ink);
}
.card-sub {
  margin-top: rpx(12);
  font-size: rpx(24);
  line-height: 1.7;
  color: var(--ink-2);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(10);
  margin-top: rpx(20);
}
.chip {
  font-size: rpx(20);
  letter-spacing: 0.04em;
  color: var(--ink-2);
  padding: rpx(6) rpx(16);
  border: 1rpx solid var(--line-2);
  border-radius: rpx(999);
  background: #f7f3ea;
  white-space: nowrap;
}
.chip.brass { color: #7a5c22; border-color: #dcc79a; background: #f6edda; }

/* ── 正文 ── */
.card-body { padding: rpx(30) rpx(36) rpx(36); }
.sect { margin-bottom: rpx(30); }
.sect:last-child { margin-bottom: 0; }
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
.sect-label::after {
  content: "";
  flex: 1;
  height: 1rpx;
  background: var(--line);
}

/* 花材 */
.fl { display: flex; flex-direction: column; gap: rpx(16); }
.fl-row {
  display: flex;
  align-items: baseline;
  gap: rpx(14);
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
.fl-lang {
  font-size: rpx(23);
  color: var(--ink-3);
  flex: 1;
  min-width: rpx(240);
}
.fl-sec { font-size: rpx(26); color: var(--ink-2); line-height: 1.7; }
.fl-sec b { font-weight: 500; color: var(--ink); }
.fl-out {
  font-size: rpx(21);
  color: #9a5b33;
  background: #f3e3d2;
  border-radius: rpx(6);
  padding: rpx(2) rpx(12);
}
.fl-warn {
  margin-top: rpx(6);
  font-size: rpx(23);
  line-height: 1.65;
  color: #8a5a34;
  background: #f7ecdf;
  border-left: rpx(4) solid #c08a55;
  padding: rpx(14) rpx(20);
  border-radius: 0 rpx(8) rpx(8) 0;
}

/* 配色 */
.palette { display: flex; flex-wrap: wrap; gap: rpx(18); }
.sw {
  display: flex;
  align-items: center;
  gap: rpx(14);
  font-size: rpx(23);
  color: var(--ink-2);
}
.sw i {
  width: rpx(52);
  height: rpx(30);
  border-radius: rpx(6);
  border: 1rpx solid rgba(30, 28, 25, 0.14);
  box-shadow: inset 0 rpx(-6) rpx(12) rgba(0, 0, 0, 0.05);
  flex: none;
}

.plain { font-size: rpx(26); line-height: 1.8; color: var(--ink-2); }
.quote {
  font-family: var(--font-display);
  font-size: rpx(28);
  line-height: 1.85;
  color: var(--ink);
  padding-left: rpx(22);
  border-left: rpx(4) solid var(--brass-2);
}

/* 折叠区 */
.fold {
  border-top: 1rpx solid var(--line);
  padding-top: rpx(24);
  margin-top: rpx(26);
}
.fold summary {
  cursor: pointer;
  list-style: none;
  font-size: rpx(25);
  color: var(--moss);
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: rpx(14);
  user-select: none;
}
.fold summary::-webkit-details-marker { display: none; }
.fold summary::before {
  content: "+";
  font-family: var(--font-num);
  color: var(--brass);
  font-size: rpx(28);
  width: rpx(20);
}
.fold[open] summary::before { content: "−"; }
.fold .inner { padding-top: rpx(24); }

.steps {
  list-style: none;
  counter-reset: s;
  display: flex;
  flex-direction: column;
  gap: rpx(18);
  margin: 0;
  padding: 0;
}
.steps li {
  counter-increment: s;
  position: relative;
  padding-left: rpx(52);
  font-size: rpx(27);
  color: var(--ink-2);
  line-height: 1.7;
}
.steps li::before {
  content: counter(s);
  position: absolute;
  left: 0;
  top: rpx(2);
  width: rpx(32);
  height: rpx(32);
  border-radius: 50%;
  border: 1rpx solid var(--line-2);
  font-family: var(--font-num);
  font-size: rpx(19);
  line-height: rpx(30);
  text-align: center;
  color: var(--brass);
}

.rows { display: flex; flex-direction: column; }
.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: rpx(20);
  padding: rpx(16) 0;
  border-bottom: 1rpx solid var(--line);
  font-size: rpx(26);
}
.row-name { color: var(--ink-2); display: flex; flex-direction: column; gap: rpx(4); }
.row-det { font-style: normal; font-size: rpx(21); color: var(--ink-3); }
.row-num { font-family: var(--font-num); color: var(--ink); white-space: nowrap; }
.row.total { border-bottom: none; }
.row.total .row-name { color: var(--ink); font-weight: 500; }
.row.total .row-num { color: var(--brass); font-size: rpx(30); }
.stem-line { margin-bottom: rpx(14); font-size: rpx(24); }
.fee-note { margin-top: rpx(16); font-size: rpx(22); color: var(--ink-3); }

.copy-btn {
  margin-top: rpx(18);
  font: inherit;
  font-size: rpx(23);
  letter-spacing: 0.05em;
  color: var(--ink-2);
  background: none;
  border: 1rpx solid var(--line-2);
  border-radius: rpx(999);
  padding: rpx(10) rpx(24);
  cursor: pointer;
}
.copy-btn:active { color: var(--moss); border-color: var(--brass-2); }

/* 价格条 */
.price-bar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: rpx(20);
  margin-top: rpx(30);
  padding-top: rpx(26);
  border-top: 1rpx solid var(--line);
}
.price-main {
  font-family: var(--font-num);
  font-size: rpx(36);
  color: var(--moss);
  letter-spacing: 0.02em;
}
.price-side {
  font-size: rpx(21);
  color: var(--ink-3);
  text-align: right;
  line-height: 1.65;
}

.card-actions {
  display: flex;
  gap: rpx(16);
  margin-top: rpx(28);
}
.act {
  font: inherit;
  flex: 1;
  font-size: rpx(26);
  letter-spacing: 0.04em;
  cursor: pointer;
  padding: rpx(20) rpx(16);
  border-radius: rpx(999);
  border: 1rpx solid var(--moss);
  background: var(--moss);
  color: #f7f4ec;
  white-space: nowrap;
}
.act:active { opacity: 0.86; }
.act.ghost {
  background: none;
  color: var(--ink-2);
  border-color: var(--line-2);
}
.act.ghost:active { color: var(--moss); border-color: var(--brass-2); }
</style>
