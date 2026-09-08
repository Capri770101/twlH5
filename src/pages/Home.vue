<template>
  <div class="page">
    <!-- ===== 顶部导航栏 ===== -->
    <div class="header-bar">
      <button class="location-picker" @click="onLocationTap">
        <span class="location-pin"></span>
        <span class="location-text">{{ userAddress }}</span>
        <span class="location-arrow arrow-down"></span>
      </button>
    </div>

    <!-- ===== 搜索栏 ===== -->
    <div class="search-section">
      <div class="search-bar">
        <span class="line-search-mark line-search-mark-compact"></span>
        <span class="search-placeholder">搜索花束、花店...</span>
      </div>
    </div>

    <!-- ===== Banner 轮播 ===== -->
    <div class="banner-section">
      <div
        ref="bannerRef"
        class="banner-swiper hide-scrollbar"
        @scroll.passive="onBannerScroll"
      >
        <div
          v-for="item in banners"
          :key="item.id"
          class="banner-card"
          :style="bannerStyle(item)"
        >
          <div class="banner-content">
            <span class="banner-title">{{ item.title }}</span>
            <span class="banner-subtitle">{{ item.subtitle }}</span>
            <span v-if="item.desc" class="banner-desc">{{ item.desc }}</span>
          </div>
          <div class="banner-emoji">🌸</div>
        </div>
      </div>
      <div class="banner-dots">
        <span
          v-for="(item, i) in banners"
          :key="item.id"
          class="banner-dot"
          :class="{ active: i === activeBanner }"
        ></span>
      </div>
    </div>

    <!-- ===== AI 花艺顾问入口 ===== -->
    <section class="ai-entry" @click="router.push({ name: 'advisor' })">
      <div class="ai-entry-icon">🤖</div>
      <div class="ai-entry-text">
        <span class="ai-entry-title">AI 花艺顾问</span>
        <span class="ai-entry-sub">说说故事，AI 帮你搭配一束刚刚好的花</span>
      </div>
      <span class="ai-entry-arrow">›</span>
    </section>

    <!-- ===== 同城花店 ===== -->
    <section v-if="nearbyShops.length" class="section">
      <div class="section-header">
        <span class="section-title">同城花店</span>
        <span class="section-more" @click="router.push({ name: 'shops' })">更多花店 ›</span>
      </div>
      <div class="shop-scroll hide-scrollbar">
        <div class="shop-list">
          <div v-for="shop in nearbyShops" :key="shop.id" class="shop-card" @click="toShop(shop.id)">
            <div class="shop-cover">
              <FlowerImage :src="shop.avatar" :emoji="shop.name ? shop.name[0] : '🌸'" />
              <span v-if="shop.isNew" class="shop-tag-new">新店</span>
            </div>
            <div class="shop-info">
              <span class="shop-name text-ellipsis">{{ shop.name }}</span>
              <div class="shop-meta">
                <span class="shop-rating">⭐ {{ shop.rating }}</span>
                <span v-if="shop.distanceKm !== null" class="shop-distance">{{ shop.distance }}</span>
              </div>
              <div class="shop-tags">
                <span v-for="tag in shop.tags" :key="tag" class="shop-tag">{{ tag }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 场景分类 ===== -->
    <section class="section">
      <div class="section-header">
        <span class="section-title">按场景选花</span>
        <span class="section-more" @click="goCategory()">全部场景 ›</span>
      </div>
      <div class="category-scroll hide-scrollbar">
        <div class="category-list">
          <div v-for="c in categories" :key="c.id + c.name" class="category-item" @click="goCategory(c.id)">
            <div class="category-icon" :style="{ background: c.color + '18' }">
              <span>{{ c.icon }}</span>
            </div>
            <span class="category-name">{{ c.name }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 推荐花束 ===== -->
    <section v-if="recommendFlowers.length" class="section">
      <div class="section-header">
        <span class="section-title">推荐花束</span>
        <span class="section-more" @click="goCategory()">查看更多 ›</span>
      </div>
      <div class="flower-scroll hide-scrollbar">
        <div class="flower-list">
          <div
            v-for="item in recommendFlowers"
            :key="item.id"
            class="flower-card"
            @click="goDetail(item)"
          >
            <div class="flower-img-wrap">
              <FlowerImage :src="item.img" />
              <span v-if="item.hasDiscount" class="flower-tag">-{{ item.discountRate }}%</span>
            </div>
            <div class="flower-info">
              <span class="flower-name">{{ item.name }}</span>
              <span class="flower-subtitle">{{ item.subtitle }}</span>
              <div class="flower-price-row">
                <span class="flower-price">¥{{ item.priceText }}</span>
                <span v-if="item.showOriginal" class="flower-original-price">¥{{ item.originalText }}</span>
              </div>
              <span v-if="item.sales > 0" class="flower-sales">已售{{ item.salesText }}</span>
              <span v-else class="flower-sales">今日多人浏览</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 骨架屏 -->
    <div v-if="loading" class="page-skeleton">
      <div class="skeleton" :style="{ height: rpx(280), margin: rpx(16) + ' ' + rpx(24) }"></div>
      <div class="skeleton" :style="{ height: rpx(240), margin: rpx(16) + ' ' + rpx(24) }"></div>
    </div>

    <div class="tabbar-placeholder"></div>

    <div v-if="toastText" class="twd-toast">{{ toastText }}</div>
  </div>
  <AddressManager v-model="showAddr" />

</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeIndex } from '@/mock/api'
import FlowerImage from '@/components/FlowerImage.vue'
import store from '@/store'
import AddressManager from '@/components/AddressManager.vue'

const router = useRouter()
const rpx = n => `${n / 750}rem`

const banners = ref([])
const categories = ref([])
const nearbyShops = ref([])
const recommendFlowers = ref([])
const loading = ref(true)
const userAddress = computed(() => store.selectedAddress?.full || '请选择收货地址')
const showAddr = ref(false)

const bannerRef = ref(null)
const activeBanner = ref(0)
let bannerTimer = null

const toastText = ref('')
let toastTimer = null

function toast(text) {
  toastText.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}

function bannerStyle(item) {
  return { background: `linear-gradient(135deg, ${item.color} 0%, ${item.color}88 100%)` }
}

function goDetail(item) {
  router.push({ name: 'detail', params: { id: item.id } })
}

function toShop(id) {
  router.push({ name: 'shop-detail', params: { id } })
}

function goCategory(catId) {
  router.push({ name: 'category', query: catId ? { cat: catId } : {} })
}

function onLocationTap() {
  showAddr.value = true
}

function onBannerScroll(e) {
  const el = e.target
  const i = Math.round(el.scrollLeft / el.clientWidth)
  if (i !== activeBanner.value) activeBanner.value = i
}

onMounted(async () => {
  const data = await getHomeIndex()
  banners.value = data.banners
  categories.value = data.categories
  nearbyShops.value = data.nearbyShops
  recommendFlowers.value = data.recommendFlowers
  loading.value = false

  bannerTimer = setInterval(() => {
    const el = bannerRef.value
    if (!el || !banners.value.length) return
    const next = (activeBanner.value + 1) % banners.value.length
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    activeBanner.value = next
  }, 4000)
})

onUnmounted(() => {
  clearInterval(bannerTimer)
  clearTimeout(toastTimer)
})
</script>

<style lang="scss" scoped>
.page {
  padding-bottom: rpx(20);
  overflow-x: hidden;
  max-width: 1rem;
  margin: 0 auto;
}

/* ===== 顶部导航栏 ===== */
.header-bar {
  display: flex;
  align-items: center;
  padding: rpx(12) rpx(20);
  background: #fff;
}
.location-picker {
  display: flex;
  align-items: center;
  gap: rpx(10);
  flex: 1;
  min-width: 0;
  padding: rpx(8) rpx(12);
  border: none;
  background: #fff;
}
.location-text {
  font-size: rpx(28);
  font-weight: 700;
  line-height: rpx(40);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: rpx(520);
}
.location-arrow {
  margin-left: rpx(6);
}

/* ===== 搜索栏 ===== */
.search-section {
  padding: rpx(16) rpx(20);
  background: #fff;
}
.search-bar {
  display: flex;
  align-items: center;
  height: rpx(72);
  background: var(--bg);
  border-radius: rpx(36);
  padding: 0 rpx(24);
}
.search-placeholder {
  color: var(--text-light);
  font-size: rpx(28);
  flex: 1;
}

/* ===== Banner ===== */
.banner-section {
  position: relative;
  margin: rpx(16) rpx(24);
}
.banner-swiper {
  display: flex;
  height: rpx(280);
  border-radius: var(--radius-lg);
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
}
.banner-card {
  flex: 0 0 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 rpx(40);
  border-radius: var(--radius-lg);
  scroll-snap-align: start;
}
.banner-content {
  display: flex;
  flex-direction: column;
  gap: rpx(8);
  min-width: 0;
}
.banner-title {
  font-size: rpx(40);
  font-weight: 700;
  color: #fff;
}
.banner-subtitle {
  font-size: var(--fs-minor);
  color: rgba(255, 255, 255, 0.85);
}
.banner-desc {
  font-size: var(--fs-caption);
  color: rgba(255, 255, 255, 0.7);
  margin-top: rpx(2);
}
.banner-emoji {
  font-size: rpx(80);
  opacity: 0.6;
}
.banner-dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: rpx(20);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: rpx(12);
}
.banner-dot {
  width: rpx(12);
  height: rpx(12);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  transition: background 0.25s ease;
}
.banner-dot.active {
  background: #fff;
}

/* ===== 通用分区 ===== */
.section {
  margin: rpx(24) 0;
}
.section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 rpx(24) rpx(16);
}
.section-title {
  font-size: rpx(34);
  font-weight: 700;
  color: var(--text-primary);
}
.section-more {
  font-size: var(--fs-body);
  color: var(--text-light);
}

/* ===== 场景分类 ===== */
.category-scroll {
  width: 100%;
  overflow-x: auto;
  white-space: nowrap;
}
.category-list {
  display: flex;
  padding: 0 rpx(24);
  gap: rpx(8);
}
.category-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: rpx(10);
  padding: rpx(12) rpx(8);
  min-width: rpx(130);
}
.category-icon {
  width: rpx(88);
  height: rpx(88);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(40);
}
.category-name {
  font-size: var(--fs-minor);
  color: var(--text-secondary);
  text-align: center;
}

/* ===== 附近花店 ===== */
.shop-scroll {
  width: 100%;
  overflow-x: auto;
  white-space: nowrap;
}
.shop-list {
  display: flex;
  padding: 0 rpx(24);
  gap: rpx(16);
}
.shop-card {
  width: rpx(260);
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}
.shop-cover {
  position: relative;
  height: rpx(240);
  overflow: hidden;
}
.shop-tag-new {
  position: absolute;
  top: rpx(12);
  right: rpx(12);
  background: var(--secondary-gradient);
  color: #fff;
  font-size: var(--fs-label);
  padding: rpx(4) rpx(12);
  border-radius: rpx(6);
}
.shop-info {
  padding: rpx(16);
  display: flex;
  flex-direction: column;
  gap: rpx(8);
}
.shop-name {
  font-size: rpx(28);
  font-weight: 600;
}
.shop-meta {
  display: flex;
  align-items: center;
  gap: rpx(12);
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}
.shop-rating { color: #FF9500; }
.shop-tags {
  display: flex;
  gap: rpx(6);
  flex-wrap: wrap;
}
.shop-tag {
  font-size: var(--fs-label);
  color: var(--secondary);
  background: var(--secondary-light);
  padding: rpx(2) rpx(10);
  border-radius: rpx(4);
}

/* ===== 推荐花束 ===== */
.flower-scroll {
  width: 100%;
  overflow-x: auto;
  white-space: nowrap;
}
.flower-list {
  display: flex;
  padding: 0 rpx(24);
  gap: rpx(16);
}
.flower-card {
  width: rpx(280);
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
.flower-img-wrap {
  position: relative;
  width: rpx(280);
  height: rpx(240);
  overflow: hidden;
  background: linear-gradient(135deg, #FFF5F0 0%, #F8F0FF 100%);
}
.flower-tag {
  position: absolute;
  top: rpx(12);
  left: rpx(12);
  background: #E8615D;
  color: #fff;
  font-size: var(--fs-label);
  font-weight: 600;
  padding: rpx(2) rpx(10);
  border-radius: rpx(6);
}
.flower-info {
  padding: rpx(16);
  display: flex;
  flex-direction: column;
  gap: rpx(6);
}
.flower-name {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flower-subtitle {
  font-size: var(--fs-caption);
  color: var(--text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flower-price-row {
  display: flex;
  align-items: baseline;
  gap: rpx(8);
}
.flower-price {
  font-size: rpx(30);
  font-weight: 700;
  color: #E8615D;
}
.flower-original-price {
  font-size: var(--fs-label);
  color: #ccc;
  text-decoration: line-through;
}
.flower-sales {
  font-size: var(--fs-label);
  color: #bbb;
}

/* ===== 骨架屏 ===== */
.page-skeleton {
  padding-top: rpx(8);
}

.tabbar-placeholder {
  height: rpx(120);
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

/* AI 花艺顾问入口 */
.ai-entry {
  display: flex;
  align-items: center;
  gap: rpx(20);
  margin: rpx(20) rpx(24) 0;
  padding: rpx(26) rpx(28);
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #ffffff 0%, #fff7f4 58%, #eef8f6 100%);
  border: 1rpx solid rgba(232, 97, 93, 0.12);
  box-shadow: 0 rpx(12) rpx(36) rgba(83, 62, 48, 0.06);
  cursor: pointer;
}
.ai-entry-icon {
  width: rpx(72);
  height: rpx(72);
  border-radius: rpx(20);
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff0f0;
  font-size: rpx(40);
  flex-shrink: 0;
}
.ai-entry-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ai-entry-title {
  font-size: rpx(30);
  font-weight: 800;
  color: var(--text-primary);
}
.ai-entry-sub {
  margin-top: rpx(6);
  font-size: rpx(22);
  color: var(--text-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ai-entry-arrow {
  font-size: rpx(40);
  color: var(--text-light);
  flex-shrink: 0;
}
</style>
