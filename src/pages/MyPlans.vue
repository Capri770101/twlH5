<template>
  <div class="page">
    <NavBar title="我的方案" />

    <div v-if="plans.length === 0" class="empty">
      <div class="empty-emoji">💐</div>
      <div class="empty-title">还没有保存的方案</div>
      <div class="empty-sub">问问 AI 花艺顾问，让它帮你 DIY 一束</div>
      <button class="empty-btn" @click="router.push({ name: 'advisor' })">去找 AI 顾问</button>
    </div>

    <div v-else class="plan-list">
      <div class="plan-card" v-for="p in plans" :key="p.id">
        <div class="plan-head" @click="toggle(p.id)">
          <div class="plan-img">
            <FlowerImage :src="isImageUrl(p.image) ? p.image : ''" emoji="💐" />
          </div>
          <div class="plan-main">
            <div class="plan-name">{{ p.name }}</div>
            <div class="plan-meta">
              <span v-if="p.skillLevel" class="plan-chip skill">{{ p.skillLevel }}</span>
              <span v-if="p.suitableFor" class="plan-chip">{{ p.suitableFor }}</span>
            </div>
            <div class="plan-price">¥{{ moneyYuan(p.price) }}</div>
          </div>
          <span class="plan-arrow" :class="{ open: expanded === p.id }">›</span>
        </div>

        <div v-if="expanded === p.id" class="plan-detail">
          <div v-if="p.materials && p.materials.length" class="sec">
            <div class="sec-title">🌿 花材清单</div>
            <div class="mats">
              <span v-for="(m, i) in p.materials" :key="i" class="mat">
                {{ m.name }}<em v-if="m.qty > 0">×{{ m.qty }}{{ m.unit || '支' }}</em>
              </span>
            </div>
          </div>

          <div v-if="p.budget && p.budget.length" class="sec">
            <div class="sec-title">💰 预算明细</div>
            <div class="budget">
              <div v-for="(b, i) in p.budget" :key="i" class="budget-row">
                <span>{{ b.label }}</span>
                <span class="budget-num">¥{{ moneyYuan(b.amount) }}</span>
              </div>
            </div>
          </div>

          <div v-if="p.careTips" class="sec">
            <div class="sec-title">💧 养护贴士</div>
            <div class="sec-text">{{ p.careTips }}</div>
          </div>

          <div v-if="p.greeting" class="sec">
            <div class="sec-title">💌 贺卡建议</div>
            <div class="sec-text">{{ p.greeting }}</div>
            <button class="copy-btn" @click="copy(p.greeting)">一键复制</button>
          </div>

          <div class="plan-saved" v-if="p.savedAt">保存于 {{ fmtTime(p.savedAt) }}</div>
        </div>

        <div class="plan-actions">
          <button class="plan-btn cart" @click="onAdd(p)">加入购物车</button>
          <button class="plan-btn del" @click="onRemove(p)">删除</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import store, { addToCart, removeDiyPlan } from '@/store'
import { toast } from '@/utils/toast'

const router = useRouter()
const plans = store.diyPlans
const expanded = ref('')

function isImageUrl(s) {
  return /^https?:\/\//.test(s || '')
}
function toggle(id) {
  expanded.value = expanded.value === id ? '' : id
}
// DIY 方案的 price 单位是「元」，展示保留两位
function moneyYuan(v) {
  const n = Number(v) || 0
  return n.toFixed(2)
}
function fmtTime(ts) {
  const d = new Date(Number(ts) || Date.now())
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function onAdd(p) {
  addToCart({
    id: 'diy_' + p.id,
    name: p.name,
    subtitle: 'AI 定制方案',
    // store 里价格以「分」计，DIY 方案存的单位是「元」
    price: Math.round((Number(p.price) || 0) * 100),
    image: p.image || '',
    shopId: 'default',
    quantity: 1
  })
  toast('已加入购物车')
}

function onRemove(p) {
  removeDiyPlan(p.id)
  toast('已删除方案')
}

function copy(text) {
  const t = String(text || '')
  if (!t) return
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => toast('贺卡文案已复制'))
  } else {
    toast('贺卡文案已复制')
  }
}

</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(40);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: rpx(180);
  text-align: center;
}
.empty-emoji { font-size: rpx(120); }
.empty-title { margin-top: rpx(30); font-size: rpx(32); font-weight: 600; color: var(--text-primary); }
.empty-sub { margin-top: rpx(14); font-size: rpx(26); color: var(--text-secondary); }
.empty-btn {
  margin-top: rpx(48);
  border: none;
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(28);
  font-weight: 600;
  padding: rpx(20) rpx(64);
  border-radius: rpx(999);
}

.plan-list { padding: rpx(24); display: flex; flex-direction: column; gap: rpx(20); }
.plan-card {
  background: #fff;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.plan-head {
  display: flex;
  align-items: center;
  gap: rpx(20);
  padding: rpx(20);
}
.plan-img {
  width: rpx(140);
  height: rpx(140);
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #f3efe9;
  display: flex;
  align-items: center;
  justify-content: center;
  img { width: 100%; height: 100%; object-fit: cover; }
}
.plan-img-emoji { font-size: rpx(64); }
.plan-main { flex: 1; min-width: 0; }
.plan-name {
  font-size: rpx(30);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.plan-meta { margin-top: rpx(8); display: flex; gap: rpx(8); flex-wrap: wrap; }
.plan-chip {
  padding: rpx(3) rpx(12);
  border-radius: rpx(999);
  background: #f6f3ee;
  color: var(--text-secondary);
  font-size: rpx(20);
}
.plan-chip.skill { background: #eaf6ee; color: #3f8f68; }
.plan-price { margin-top: rpx(10); font-size: rpx(32); font-weight: 700; color: var(--primary); }
.plan-arrow {
  flex: none;
  font-size: rpx(40);
  color: var(--text-secondary);
  transition: transform 0.2s;
}
.plan-arrow.open { transform: rotate(90deg); }

.plan-detail { padding: 0 rpx(20) rpx(8); border-top: 1rpx dashed #ece7e0; }
.sec { padding-top: rpx(16); }
.sec-title { font-size: rpx(24); font-weight: 600; color: #6b625c; margin-bottom: rpx(10); }
.sec-text { font-size: rpx(24); color: #4e4641; line-height: 1.55; }
.mats { display: flex; flex-wrap: wrap; gap: rpx(10); }
.mat {
  padding: rpx(7) rpx(14);
  border: 1rpx solid #ece7e0;
  border-radius: rpx(10);
  font-size: rpx(22);
  color: var(--text-primary);
  em { font-style: normal; color: var(--primary); margin-left: rpx(6); font-weight: 600; }
}
.budget {
  padding: rpx(10) rpx(14);
  border: 1rpx solid #ece7e0;
  border-radius: rpx(10);
  background: #faf8f5;
}
.budget-row {
  display: flex;
  justify-content: space-between;
  padding: rpx(4) 0;
  font-size: rpx(23);
  color: #5c524d;
}
.budget-num { color: var(--text-primary); font-weight: 600; }
.copy-btn {
  margin-top: rpx(10);
  border: none;
  background: #251f1c;
  color: #fff;
  font-size: rpx(22);
  padding: rpx(8) rpx(20);
  border-radius: rpx(999);
}
.plan-saved { margin-top: rpx(14); font-size: rpx(20); color: #a39a93; }

.plan-actions {
  display: flex;
  gap: rpx(16);
  padding: rpx(16) rpx(20) rpx(20);
}
.plan-btn {
  flex: 1;
  height: rpx(64);
  border-radius: rpx(999);
  font-size: rpx(24);
  font-weight: 600;
  border: none;
}
.plan-btn.cart { background: var(--primary-gradient); color: #fff; }
.plan-btn.del { background: #f3efe9; color: var(--text-secondary); }

</style>
