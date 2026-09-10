<template>
  <div class="page">
    <NavBar :title="flower ? flower.name : '商品详情'" />

    <!-- 加载骨架 -->
    <div v-if="!flower && loading" class="loading-state">
      <div class="skeleton" :style="{ height: rpx(500), margin: rpx(16) + ' ' + rpx(24) }"></div>
      <div class="skeleton" :style="{ height: rpx(40), margin: rpx(16) + ' ' + rpx(24), width: '60%' }"></div>
      <div class="skeleton" :style="{ height: rpx(80), margin: rpx(16) + ' ' + rpx(24) }"></div>
    </div>

    <template v-if="flower">
      <!-- 大图区 -->
      <div class="detail-hero">
        <FlowerImage v-if="flower.images && flower.images.length" :src="flower.images[0]" />
        <div v-else class="detail-hero-placeholder">
          <span class="detail-hero-emoji">{{ heroEmoji }}</span>
        </div>
        <div class="detail-hero-top-mask"></div>
        <div class="detail-tags">
          <span v-for="tag in flower.displayTags" :key="tag" class="tag tag-primary">{{ tag }}</span>
        </div>
        <button class="detail-fav-btn" :class="{ active: favorited }" @click.stop="onToggleFav">{{ favorited ? '♥' : '♡' }}</button>
        <button class="detail-poster-btn" @click="onShowPoster">🖼️</button>
        <button class="detail-share-btn" @click="onShare">↗</button>
      </div>

      <!-- 基本信息 -->
      <div class="detail-section">
        <div class="detail-header">
          <span class="detail-name">{{ flower.name }}</span>
          <span class="detail-subtitle">{{ flower.subtitle }}</span>
        </div>
        <div class="detail-price-row">
          <div class="detail-price">
            <span class="price price-lg">{{ money(currentPrice) }}</span>
            <span v-if="hasDiscount" class="price-original price-md">{{ money(currentOriginalPrice) }}</span>
            <span v-if="hasDiscount" class="detail-discount">{{ discountRate }}折</span>
          </div>
          <div class="detail-meta">
            <span v-if="flower.sales > 0" class="detail-sales">已售{{ flower.sales }}</span>
            <span v-else class="detail-sales">今日多人浏览</span>
            <span class="detail-stock">库存{{ flower.stock }}</span>
          </div>
        </div>
      </div>

      <!-- 规格选择 -->
      <div v-if="specs.length > 1" class="detail-section detail-spec-section">
        <div class="section-label">
          选择规格
          <span v-if="activeSpec" class="spec-selected">已选：{{ activeSpec.name }}</span>
        </div>
        <div class="spec-list">
          <button
            v-for="sp in specs"
            :key="sp.id"
            class="spec-chip"
            :class="{ active: sp.id === selectedSpecId }"
            @click="selectedSpecId = sp.id"
          >
            <span class="spec-name">{{ sp.name }}</span>
            <span class="spec-desc">{{ sp.desc }}</span>
            <span class="spec-price price">{{ money(sp.price) }}</span>
          </button>
        </div>
      </div>

      <!-- 适合场景 -->
      <div class="detail-section detail-scene-section">
        <div class="section-label">适合场景</div>
        <div class="scene-tags">
          <span v-for="item in flower.sceneItems" :key="item">{{ item }}</span>
        </div>
        <div class="detail-promise-row">
          <span>{{ flower.deliveryText }}</span>
          <span>现扎鲜花</span>
        </div>
      </div>

      <!-- 花材组成 -->
      <div class="detail-section">
        <div class="section-label">花材组成</div>
        <div class="flower-items">
          <div v-for="item in flower.materialItems" :key="item" class="flower-item">
            <span class="flower-item-dot">•</span>
            <span>{{ item }}</span>
          </div>
        </div>
      </div>

      <!-- 花语寓意 -->
      <div class="detail-section">
        <div class="section-label">花语寓意</div>
        <span class="flower-meaning">{{ flower.meaningText }}</span>
      </div>

      <!-- 商品描述 -->
      <div class="detail-section">
        <div class="section-label">商品描述</div>
        <span class="flower-desc">{{ flower.descriptionText }}</span>
      </div>

      <!-- 服务承诺 -->
      <div class="detail-section">
        <div class="section-label">服务承诺</div>
        <div class="service-grid">
          <div v-for="item in flower.serviceItems" :key="item" class="service-item">
            <span class="service-check">✓</span>
            <span>{{ item }}</span>
          </div>
        </div>
      </div>

      <!-- 商品信息 -->
      <div class="detail-section">
        <div class="section-label">商品信息</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">季节</span>
            <span class="info-value">{{ flower.season }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">保鲜期</span>
            <span class="info-value">{{ flower.shelfLife }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">热度</span>
            <span v-if="flower.sales > 0" class="info-value">已售{{ flower.sales }}件</span>
            <span v-else class="info-value">今日多人浏览</span>
          </div>
          <div class="info-item">
            <span class="info-label">配送</span>
            <span class="info-value">{{ flower.deliveryText }}</span>
          </div>
        </div>
      </div>

      <!-- 买家评价 -->
      <div class="detail-section review-section">
        <div class="review-head">
          <span class="section-label">买家评价（{{ reviews.length }}）</span>
          <div class="review-score">
            <span class="review-score-num">{{ reviewAvg }}</span>
            <span class="review-score-star">★</span>
          </div>
        </div>
        <div v-if="reviews.length" class="review-list">
          <div v-for="(rv, i) in reviews.slice(0, 5)" :key="i" class="review-item">
            <div class="review-item-head">
              <span class="review-user" :class="{ mine: rv.mine }">{{ rv.user }}</span>
              <span class="review-date">{{ rv.date }}</span>
            </div>
            <div class="review-stars">
              <span v-for="n in 5" :key="n" class="rs" :class="{ on: n <= rv.rating }">★</span>
            </div>
            <span class="review-text">{{ rv.content }}</span>
            <div v-if="rv.tags && rv.tags.length" class="review-tag-row">
              <span v-for="t in rv.tags" :key="t">{{ t }}</span>
            </div>
          </div>
        </div>
        <div v-else class="review-empty">还没有评价，等你来分享第一束花</div>
      </div>

      <div class="footer-placeholder"></div>

      <!-- 底部操作栏 -->
      <div class="detail-footer">
        <div class="detail-footer-left">
          <button class="footer-action" @click="router.push({ name: 'home' })">
            <img class="footer-icon footer-icon-nav" src="/images/tab-home.png" alt="店铺" />
            <span class="footer-action-text">店铺</span>
          </button>
          <button class="footer-action footer-action-ai" @click="router.push({ name: 'advisor' })">
            <span class="footer-ai-icon">AI</span>
            <span class="footer-action-text">花艺顾问</span>
          </button>
          <button class="footer-action" @click="router.push({ name: 'cart' })">
            <img class="footer-icon footer-icon-nav" src="/images/tab-cart.png" alt="购物车" />
            <span class="footer-action-text">购物车</span>
            <span v-if="cartCount > 0" class="badge footer-badge">{{ cartCount > 99 ? '99+' : cartCount }}</span>
          </button>
        </div>
        <div class="detail-footer-right">
          <button class="detail-action-btn detail-action-cart" @click="onAddCart">加入购物车</button>
          <button class="detail-action-btn detail-action-buy" @click="onBuyNow">立即购买</button>
        </div>
      </div>
    </template>

    <div v-if="toastText" class="twd-toast">{{ toastText }}</div>
    <SharePoster v-if="showPoster" :product="flower" @close="showPoster = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getFlowerDetail, getProductReviews } from '@/mock/api'
import { addToCart, cartCount, money, toggleFavorite, isFavorite } from '@/store'
import { deriveSpecs, defaultSpec } from '@/utils/specs'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import SharePoster from '@/components/SharePoster.vue'

const route = useRoute()
const router = useRouter()
const rpx = n => `${n / 750}rem`

const flower = ref(null)
const loading = ref(true)

const toastText = ref('')
let toastTimer = null
function toast(text) {
  toastText.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}

const favorited = computed(() => flower.value && isFavorite(flower.value.id))
function onToggleFav() {
  if (!flower.value) return
  const now = toggleFavorite(flower.value)
  toast(now ? '已收藏 ❤️' : '已取消收藏')
}

const heroEmoji = computed(() => {
  const map = {
    '1': '\u{1F339}', '2': '\u{1F33B}', '3': '\u{1F54A}️',
    '4': '\u{1F490}', '5': '\u{1F492}', '6': '\u{1F4BC}'
  }
  return (flower.value && map[flower.value.categoryId]) || '\u{1F337}'
})

/* ===== 规格 ===== */
const specs = computed(() => deriveSpecs(flower.value))
const selectedSpecId = ref('')

watch(specs, list => {
  if (!list.length) { selectedSpecId.value = ''; return }
  if (!list.some(s => s.id === selectedSpecId.value)) {
    selectedSpecId.value = (defaultSpec(list) || {}).id || ''
  }
}, { immediate: true })

const activeSpec = computed(() =>
  specs.value.find(s => s.id === selectedSpecId.value) || defaultSpec(specs.value)
)

const currentPrice = computed(() => {
  if (activeSpec.value) return activeSpec.value.price
  return (flower.value && flower.value.price) || 0
})
const currentOriginalPrice = computed(() => {
  if (activeSpec.value && activeSpec.value.originalPrice) return activeSpec.value.originalPrice
  return (flower.value && flower.value.originalPrice) || 0
})
const hasDiscount = computed(() => currentOriginalPrice.value > currentPrice.value)
const discountRate = computed(() => {
  if (!hasDiscount.value) return '0'
  return (Math.round((currentPrice.value / currentOriginalPrice.value) * 100) / 10).toFixed(1)
})

// 把当前商品 + 选中规格组装成购物车条目
function buildCartItem() {
  const f = flower.value
  if (!f) return null
  const sp = activeSpec.value
  return {
    ...f,
    price: currentPrice.value,
    originalPrice: currentOriginalPrice.value,
    specId: sp ? sp.id : '',
    specName: sp ? sp.name : ''
  }
}

function onAddCart() {
  const item = buildCartItem()
  if (!item) return
  addToCart(item, 1)
  toast('已加入购物车')
}

function onBuyNow() {
  const item = buildCartItem()
  if (!item) return
  addToCart(item, 1)
  router.push({ name: 'checkout' })
}

function onShare() {
  const url = location.href
  const title = flower.value ? flower.value.name : '跳舞兰AI花店'
  if (navigator.share) {
    navigator.share({ title, text: '为你推荐一束好花 🌸', url }).catch(() => {})
    return
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => toast('链接已复制，去分享吧')).catch(() => toast('分享链接：' + url))
  } else {
    toast('分享链接：' + url)
  }
}

const showPoster = ref(false)
function onShowPoster() {
  if (flower.value) showPoster.value = true
}

/* ===== 买家评价 ===== */
const reviews = ref([])
const reviewAvg = computed(() => {
  if (!reviews.value.length) return '暂无'
  const sum = reviews.value.reduce((s, r) => s + (Number(r.rating) || 0), 0)
  return (sum / reviews.value.length).toFixed(1)
})

onMounted(async () => {
  flower.value = await getFlowerDetail(route.params.id)
  loading.value = false
  getProductReviews(route.params.id).then(list => { reviews.value = list || [] }).catch(() => {})
})

onUnmounted(() => clearTimeout(toastTimer))
</script>

<style lang="scss" scoped>
.page {
  background: #fff;
  min-height: 100vh;
  padding-bottom: rpx(20);
}

/* ===== 大图 ===== */
.detail-hero {
  position: relative;
  width: 100%;
  height: rpx(750);
  background: #f8f5f2;
  overflow: hidden;
}
.detail-hero-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #FFF0F0 0%, #FFF9E6 50%, #E8FAF8 100%);
}
.detail-hero-emoji {
  font-size: rpx(140);
}
.detail-hero-top-mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 2;
  height: rpx(6);
  background: #f8f5f2;
  pointer-events: none;
}
.detail-tags {
  position: absolute;
  top: rpx(24);
  left: rpx(24);
  display: flex;
  flex-wrap: wrap;
  gap: rpx(8);
  right: rpx(200);
}
.detail-share-btn {
  position: absolute;
  top: rpx(24);
  right: rpx(24);
  width: rpx(72);
  height: rpx(72);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #251f1c;
  font-size: rpx(42);
  line-height: 1;
  border: none;
  padding: 0;
  box-shadow: 0 rpx(8) rpx(24) rgba(0, 0, 0, 0.12);
}
.detail-poster-btn {
  position: absolute;
  top: rpx(110);
  right: rpx(24);
  width: rpx(72);
  height: rpx(72);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #251f1c;
  font-size: rpx(34);
  line-height: 1;
  border: none;
  padding: 0;
  box-shadow: 0 rpx(8) rpx(24) rgba(0, 0, 0, 0.12);
}
.detail-fav-btn {
  position: absolute;
  top: rpx(24);
  right: rpx(110);
  width: rpx(72);
  height: rpx(72);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: rpx(42);
  line-height: 1;
  border: none;
  padding: 0;
  box-shadow: 0 rpx(8) rpx(24) rgba(0, 0, 0, 0.12);
  z-index: 3;
  &.active { color: #FF4D4F; }
}

/* ===== 分区 ===== */
.detail-section {
  padding: rpx(24);
  border-bottom: rpx(1) solid var(--border-light);
}
.section-label {
  font-size: rpx(28);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: rpx(16);
}
.detail-scene-section {
  background: #fffdfa;
}

/* ===== 规格 ===== */
.detail-spec-section {
  background: #fff;
}
.detail-spec-section .section-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: rpx(12);
}
.spec-selected {
  font-size: var(--fs-caption);
  font-weight: 400;
  color: var(--primary);
}
.spec-list {
  display: flex;
  flex-direction: column;
  gap: rpx(14);
}
.spec-chip {
  display: flex;
  align-items: center;
  gap: rpx(12);
  padding: rpx(18) rpx(22);
  border: rpx(2) solid #ece7e0;
  border-radius: var(--radius-sm);
  background: #faf8f5;
  text-align: left;
  transition: all 0.15s;
}
.spec-chip.active {
  border-color: var(--primary);
  background: var(--primary-light);
}
.spec-name {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}
.spec-desc {
  font-size: var(--fs-caption);
  color: var(--text-light);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spec-price {
  font-size: rpx(28);
  font-weight: 700;
  color: var(--primary);
  flex-shrink: 0;
}
.scene-tags {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(12);
}
.scene-tags span {
  padding: rpx(12) rpx(18);
  border-radius: rpx(999);
  background: #fff4dc;
  color: #8b5b12;
  font-size: rpx(25);
  font-weight: 600;
}
.detail-promise-row {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(12);
  margin-top: rpx(18);
}
.detail-promise-row span {
  padding: rpx(10) rpx(16);
  border-radius: rpx(8);
  background: #f7f5f2;
  color: #6f6660;
  font-size: var(--fs-minor);
}

/* ===== 基本信息 ===== */
.detail-header {
  display: flex;
  flex-direction: column;
  gap: rpx(8);
}
.detail-name {
  font-size: rpx(40);
  font-weight: 700;
  color: var(--text-primary);
}
.detail-subtitle {
  font-size: rpx(28);
  color: var(--text-secondary);
}
.detail-price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: rpx(16);
}
.detail-price {
  display: flex;
  align-items: baseline;
  gap: rpx(12);
}
.price-lg { font-size: rpx(48); }
.price-md { font-size: rpx(28); }
.detail-discount {
  background: var(--primary-light);
  color: var(--primary);
  font-size: var(--fs-caption);
  font-weight: 600;
  padding: rpx(4) rpx(12);
  border-radius: rpx(6);
}
.detail-meta {
  display: flex;
  align-items: center;
  gap: rpx(16);
  font-size: var(--fs-minor);
  color: var(--text-secondary);
}
.detail-sales,
.detail-stock {
  color: var(--text-light);
}

/* ===== 花材 ===== */
.flower-items {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(12) rpx(24);
}
.flower-item {
  display: flex;
  align-items: center;
  gap: rpx(6);
  font-size: var(--fs-body);
  color: var(--text-secondary);
}
.flower-item-dot {
  color: var(--primary);
  font-weight: 700;
}

/* ===== 花语 ===== */
.flower-meaning {
  font-size: rpx(28);
  color: var(--primary);
  font-style: italic;
  line-height: 1.6;
  background: var(--primary-light);
  padding: rpx(16) rpx(24);
  border-radius: var(--radius-sm);
  display: block;
}

/* ===== 描述 ===== */
.flower-desc {
  font-size: var(--fs-body);
  color: var(--text-secondary);
  line-height: 1.8;
}

/* ===== 服务承诺 ===== */
.service-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: rpx(14);
}
.service-item {
  min-height: rpx(76);
  padding: rpx(14) rpx(16);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: rpx(10);
  background: #f8f7f5;
  color: #3a332e;
  font-size: var(--fs-minor);
  line-height: 1.35;
  box-sizing: border-box;
}
.service-check {
  width: rpx(28);
  height: rpx(28);
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffe15a;
  color: #251f1c;
  font-size: rpx(19);
  font-weight: 900;
}

/* ===== 商品信息 ===== */
.info-grid {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(16);
}
.info-item {
  flex: 1;
  min-width: 40%;
  display: flex;
  justify-content: space-between;
  gap: rpx(18);
  padding: rpx(16) rpx(20);
  background: var(--bg);
  border-radius: var(--radius-sm);
}
.info-label {
  font-size: var(--fs-minor);
  color: var(--text-light);
}
.info-value {
  min-width: 0;
  font-size: var(--fs-body);
  color: var(--text-primary);
  font-weight: 500;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 买家评价 ===== */
.review-section {
  background: #fff;
}
.review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.review-head .section-label {
  margin-bottom: 0;
}
.review-score {
  display: flex;
  align-items: baseline;
  gap: rpx(4);
  color: #ffb020;
}
.review-score-num {
  font-size: rpx(34);
  font-weight: 700;
}
.review-score-star {
  font-size: rpx(26);
}
.review-list {
  margin-top: rpx(8);
}
.review-item {
  padding: rpx(20) 0;
}
.review-item + .review-item {
  border-top: rpx(1) solid var(--border-light);
}
.review-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.review-user {
  font-size: var(--fs-minor);
  color: var(--text-secondary);
}
.review-user.mine {
  color: var(--primary);
  font-weight: 600;
}
.review-date {
  font-size: var(--fs-caption);
  color: var(--text-light);
}
.review-stars {
  display: flex;
  margin-top: rpx(8);
}
.review-stars .rs {
  color: #dadde1;
  font-size: rpx(24);
}
.review-stars .rs.on {
  color: #ffb020;
}
.review-text {
  display: block;
  margin-top: rpx(10);
  font-size: var(--fs-body);
  color: var(--text-secondary);
  line-height: 1.65;
}
.review-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(10);
  margin-top: rpx(12);
}
.review-tag-row span {
  padding: rpx(6) rpx(14);
  border-radius: rpx(6);
  background: var(--primary-light);
  color: var(--primary);
  font-size: var(--fs-caption);
}
.review-empty {
  padding: rpx(30) 0 rpx(10);
  text-align: center;
  font-size: var(--fs-minor);
  color: var(--text-light);
}

/* ===== 底部操作栏 ===== */
.footer-placeholder {
  height: rpx(150);
}
.detail-footer {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 1rem;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: rpx(16);
  padding: rpx(14) rpx(20);
  background: #fff;
  border-top: rpx(1) solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 rpx(-10) rpx(34) rgba(0, 0, 0, 0.06);
  padding-bottom: calc(#{rpx(14)} + constant(safe-area-inset-bottom));
  padding-bottom: calc(#{rpx(14)} + env(safe-area-inset-bottom));
}
.detail-footer-left {
  flex: 0 0 rpx(210);
  display: flex;
  justify-content: space-between;
  transform: translateY(rpx(8));
}
.footer-action {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: rpx(5);
  width: rpx(64);
  min-height: rpx(70);
  color: #151515;
  border: none;
  background: transparent;
  padding: 0;
}
.footer-icon {
  position: relative;
  width: rpx(38);
  height: rpx(38);
  box-sizing: border-box;
}
.footer-action-ai { width: rpx(80); }
.footer-action-ai .footer-action-text {
  font-size: var(--fs-label);
  white-space: nowrap;
}
.footer-ai-icon {
  width: rpx(38);
  height: rpx(38);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f4c96b, #e8615d);
  color: #fff;
  font-size: rpx(18);
  font-weight: 700;
  letter-spacing: rpx(-1);
}
.footer-action-text {
  font-size: rpx(21);
  color: #555;
  line-height: 1;
}
.footer-badge {
  position: absolute;
  right: 0;
  top: rpx(-3);
  min-width: rpx(26);
  height: rpx(26);
  padding: 0 rpx(6);
  border-radius: rpx(999);
  background: #050505;
  color: #fff;
  font-size: rpx(18);
  line-height: rpx(26);
  text-align: center;
  box-sizing: border-box;
}
.detail-footer-right {
  flex: 1;
  display: flex;
  gap: rpx(12);
  justify-content: flex-end;
  transform: translateY(rpx(8));
}
.detail-action-btn {
  flex: 0 0 auto;
  height: rpx(76);
  border-radius: rpx(999);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(27);
  font-weight: 500;
  box-sizing: border-box;
}
.detail-action-cart {
  width: rpx(210);
  border: rpx(2) solid #777;
  color: #171717;
  background: #fff;
}
.detail-action-buy {
  width: rpx(220);
  color: #fff;
  background: #050505;
  box-shadow: 0 rpx(7) rpx(16) rgba(0, 0, 0, 0.14);
}

.loading-state {
  padding-top: rpx(16);
}

.twd-toast {
  position: fixed;
  left: 50%;
  bottom: rpx(200);
  transform: translateX(-50%);
  padding: rpx(16) rpx(32);
  border-radius: rpx(40);
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: var(--fs-minor);
  z-index: 200;
  animation: fadeIn 0.2s ease-out;
}
</style>
