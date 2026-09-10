<template>
  <div class="page">
    <NavBar title="评价订单" />

    <div v-if="loading" class="loading">加载中…</div>

    <div v-else-if="!order" class="empty">
      <div class="empty-emoji">🧾</div>
      <div class="empty-title">订单不存在</div>
      <button class="empty-btn" @click="router.back()">返回</button>
    </div>

    <div v-else-if="alreadyReviewed" class="empty">
      <div class="empty-emoji">⭐</div>
      <div class="empty-title">这个订单已经评价过啦</div>
      <div class="empty-sub">感谢你的反馈</div>
      <button class="empty-btn" @click="goOrderDetail">查看订单</button>
    </div>

    <div v-else class="review-body">
      <!-- 订单摘要 -->
      <div class="card order-card">
        <div class="oc-shop">{{ order.shopName || '跳舞兰花店' }}</div>
        <div
          v-for="(it, i) in (order.items || [])"
          :key="i"
          class="oc-item"
        >
          <div class="oc-img">
            <img v-if="isImageUrl(it.image)" :src="it.image" alt="" />
            <span v-else>💐</span>
          </div>
          <div class="oc-info">
            <div class="oc-name">{{ it.name }}</div>
            <div class="oc-qty">×{{ it.quantity || 1 }}</div>
          </div>
        </div>
      </div>

      <!-- 总评 -->
      <div class="card">
        <div class="sec-title">整体满意度</div>
        <div class="stars big">
          <span
            v-for="n in 5"
            :key="n"
            class="star"
            :class="{ on: n <= rating }"
            @click="rating = n"
          >★</span>
          <span class="rating-text">{{ ratingText }}</span>
        </div>
      </div>

      <!-- 分项 -->
      <div class="card">
        <div class="sec-title">分项评分</div>
        <div class="sub-row" v-for="s in subItems" :key="s.key">
          <span class="sub-label">{{ s.label }}</span>
          <div class="stars small">
            <span
              v-for="n in 5"
              :key="n"
              class="star"
              :class="{ on: n <= ratings[s.key] }"
              @click="ratings[s.key] = n"
            >★</span>
          </div>
        </div>
      </div>

      <!-- 文字 -->
      <div class="card">
        <div class="sec-title">说说这束花</div>
        <textarea
          v-model="content"
          class="textarea"
          maxlength="200"
          placeholder="花新鲜吗？包装喜欢吗？配送准时吗？"
        ></textarea>
        <div class="counter">{{ content.length }}/200</div>

        <div class="quick-tags">
          <span
            v-for="t in QUICK_TAGS"
            :key="t"
            class="qtag"
            :class="{ on: content.includes(t) }"
            @click="toggleTag(t)"
          >{{ t }}</span>
        </div>
      </div>

      <!-- 匿名 -->
      <div class="card anon">
        <span>匿名评价</span>
        <span class="switch" :class="{ on: anonymous }" @click="anonymous = !anonymous">
          <i></i>
        </span>
      </div>

      <button class="submit-btn" @click="onSubmit">提交评价</button>
    </div>

    <div v-if="toastText" class="twd-toast">{{ toastText }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { getOrderDetail } from '@/mock/api'
import { saveReview, getReviewByOrder } from '@/store'

const route = useRoute()
const router = useRouter()

const QUICK_TAGS = ['花很新鲜', '包装精美', '配送准时', '和图片一致', '香味好闻', '性价比高']

const loading = ref(true)
const order = ref(null)
const alreadyReviewed = ref(false)

const rating = ref(5)
const ratings = reactive({ fresh: 5, pack: 5, delivery: 5 })
const content = ref('')
const anonymous = ref(false)

const subItems = [
  { key: 'fresh', label: '新鲜度' },
  { key: 'pack', label: '包装' },
  { key: 'delivery', label: '配送' }
]

const ratingText = computed(() => {
  return ['', '很不满意', '不太满意', '一般', '满意', '非常满意'][rating.value] || ''
})

function isImageUrl(s) {
  return /^https?:\/\//.test(s || '')
}

function toggleTag(t) {
  if (content.value.includes(t)) {
    content.value = content.value.replace(t, '').replace(/\s+/g, ' ').trim()
  } else {
    content.value = (content.value ? content.value + ' ' : '') + t
  }
}

function goOrderDetail() {
  router.replace({ name: 'order-detail', params: { id: orderId.value } })
}

const orderId = computed(() => String(route.params.orderId || ''))

onMounted(async () => {
  if (!orderId.value) {
    loading.value = false
    return
  }
  if (getReviewByOrder(orderId.value)) {
    alreadyReviewed.value = true
    loading.value = false
    return
  }
  try {
    order.value = await getOrderDetail(orderId.value)
  } catch (e) {
    order.value = null
  }
  loading.value = false
})

function onSubmit() {
  if (!order.value) return
  const row = saveReview({
    orderId: orderId.value,
    shopId: order.value.shopId || '',
    shopName: order.value.shopName || '',
    items: (order.value.items || []).map(i => ({
      productId: i.productId || i.id || '',
      name: i.name || '',
      image: i.image || ''
    })),
    rating: rating.value,
    ratings: { fresh: ratings.fresh, pack: ratings.pack, delivery: ratings.delivery },
    content: content.value.trim(),
    tags: QUICK_TAGS.filter(t => content.value.includes(t)),
    anonymous: anonymous.value
  })
  if (!row) { toast('提交失败，请重试'); return }
  toast('评价已提交，感谢反馈')
  setTimeout(() => {
    router.replace({ name: 'order-detail', params: { id: orderId.value } })
  }, 900)
}

const toastText = ref('')
let toastTimer = null
function toast(text) {
  toastText.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding: rpx(24) rpx(24) rpx(60);
}
.loading { padding-top: rpx(120); text-align: center; color: var(--text-secondary); font-size: rpx(28); }

.empty { display: flex; flex-direction: column; align-items: center; padding-top: rpx(160); text-align: center; }
.empty-emoji { font-size: rpx(110); }
.empty-title { margin-top: rpx(28); font-size: rpx(32); font-weight: 600; color: var(--text-primary); }
.empty-sub { margin-top: rpx(12); font-size: rpx(26); color: var(--text-secondary); }
.empty-btn {
  margin-top: rpx(40);
  border: none;
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(28);
  padding: rpx(18) rpx(56);
  border-radius: rpx(999);
}

.card {
  background: #fff;
  border-radius: var(--radius-md);
  padding: rpx(24);
  margin-bottom: rpx(20);
  box-shadow: var(--shadow-sm);
}

.order-card { padding: rpx(20) rpx(24); }
.oc-shop { font-size: rpx(28); font-weight: 600; color: var(--text-primary); margin-bottom: rpx(14); }
.oc-item { display: flex; gap: rpx(16); align-items: center; padding: rpx(8) 0; }
.oc-img {
  width: rpx(90);
  height: rpx(90);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #f3efe9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(40);
  img { width: 100%; height: 100%; object-fit: cover; }
}
.oc-info { flex: 1; min-width: 0; display: flex; justify-content: space-between; align-items: center; }
.oc-name { font-size: rpx(26); color: var(--text-primary); }
.oc-qty { font-size: rpx(24); color: var(--text-secondary); }

.sec-title { font-size: rpx(28); font-weight: 600; color: var(--text-primary); margin-bottom: rpx(16); }

.stars { display: flex; align-items: center; gap: rpx(12); }
.star { color: #ddd5cc; cursor: pointer; transition: color 0.15s; }
.star.on { color: #ffb020; }
.stars.big .star { font-size: rpx(56); }
.stars.small .star { font-size: rpx(36); }
.rating-text { margin-left: rpx(14); font-size: rpx(26); color: var(--primary); font-weight: 600; }

.sub-row { display: flex; align-items: center; justify-content: space-between; padding: rpx(10) 0; }
.sub-label { font-size: rpx(26); color: var(--text-secondary); }

.textarea {
  width: 100%;
  min-height: rpx(180);
  border: 1rpx solid #ece7e0;
  border-radius: var(--radius-sm);
  padding: rpx(18);
  font-size: rpx(26);
  color: var(--text-primary);
  background: #faf8f5;
  resize: none;
  box-sizing: border-box;
  font-family: inherit;
}
.counter { text-align: right; font-size: rpx(22); color: #a39a93; margin-top: rpx(8); }
.quick-tags { display: flex; flex-wrap: wrap; gap: rpx(12); margin-top: rpx(18); }
.qtag {
  padding: rpx(10) rpx(20);
  border-radius: rpx(999);
  background: #f6f3ee;
  color: var(--text-secondary);
  font-size: rpx(23);
}
.qtag.on { background: #fdeee9; color: var(--primary); font-weight: 600; }

.anon { display: flex; align-items: center; justify-content: space-between; font-size: rpx(26); color: var(--text-primary); }
.switch {
  width: rpx(88);
  height: rpx(48);
  border-radius: rpx(999);
  background: #ddd5cc;
  position: relative;
  transition: background 0.2s;
  i {
    position: absolute;
    top: rpx(5);
    left: rpx(5);
    width: rpx(38);
    height: rpx(38);
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s;
  }
}
.switch.on { background: var(--primary); }
.switch.on i { transform: translateX(rpx(40)); }

.submit-btn {
  width: 100%;
  height: rpx(96);
  border: none;
  border-radius: rpx(999);
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(32);
  font-weight: 600;
  margin-top: rpx(16);
}

.twd-toast {
  position: fixed;
  left: 50%;
  top: 45%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  font-size: rpx(26);
  padding: rpx(18) rpx(30);
  border-radius: rpx(12);
  z-index: 200;
}
</style>
