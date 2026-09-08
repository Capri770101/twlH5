<template>
  <div class="page">
    <NavBar title="选花" />

    <!-- 搜索栏 -->
    <div class="search-section">
      <div v-if="!searchFocused" class="search-bar" @click="searchFocused = true">
        <span class="line-search-mark line-search-mark-compact"></span>
        <span class="search-placeholder">搜索花束、花店...</span>
      </div>
      <div v-else class="search-bar">
        <span class="line-search-mark line-search-mark-compact"></span>
        <input
          ref="inputRef"
          v-model="searchKeyword"
          class="search-input"
          placeholder="搜索花束、花店..."
          confirm-type="search"
          @keyup.enter="onSearchConfirm"
        />
        <span class="search-cancel" @click="onSearchCancel">取消</span>
      </div>
    </div>

    <!-- 分类 Tab -->
    <div v-if="!searchKeyword" class="tabs-bar">
      <div class="tabs-scroll hide-scrollbar">
        <div class="tabs-list">
          <div
            v-for="item in categories"
            :key="item.id + item.name"
            class="tab-item"
            :class="{ active: activeCategory === item.id }"
            @click="onCategoryChange(item.id)"
          >
            <span class="tab-icon">{{ item.icon }}</span>
            <span class="tab-name">{{ item.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 排序栏 -->
    <div v-if="!searchKeyword" class="sort-bar">
      <div
        class="sort-item"
        :class="{ active: sortType === 'default' }"
        @click="onSortChange('default')"
      >综合</div>
      <div
        class="sort-item"
        :class="{ active: sortType === 'sales' }"
        @click="onSortChange('sales')"
      >销量</div>
      <div
        class="sort-item"
        :class="{ active: sortType === 'price_asc' || sortType === 'price_desc' }"
        @click="onSortChange(sortType === 'price_asc' ? 'price_desc' : 'price_asc')"
      >
        价格
        <span class="sort-arrows">
          <span class="sort-arrow" :class="{ on: sortType === 'price_asc' }">▲</span>
          <span class="sort-arrow" :class="{ on: sortType === 'price_desc' }">▼</span>
        </span>
      </div>
    </div>

    <!-- 搜索结果计数 -->
    <div v-if="searchKeyword && (flowers.length || shops.length) && !loading" class="search-result-hint">
      找到 {{ flowers.length + shops.length }} 个"{{ searchKeyword }}"相关结果
    </div>

    <!-- 花店搜索结果 -->
    <div v-if="searchKeyword && shops.length && !loading" class="shop-search-section">
      <div class="shop-search-title">🏪 相关花店</div>
      <div class="shop-search-list">
        <div v-for="shop in shops" :key="shop.id" class="shop-card">
          <div class="shop-cover">
            <span class="shop-cover-placeholder">🌸</span>
            <span v-if="shop.isNew" class="shop-tag-new">新店</span>
          </div>
          <div class="shop-info">
            <div class="shop-name-row">
              <span class="shop-name text-ellipsis">{{ shop.name }}</span>
              <span class="shop-rating">⭐ {{ shop.rating }}</span>
            </div>
            <div class="shop-meta-row">
              <span class="shop-distance">📍 {{ shop.distance }}</span>
              <span class="shop-sales">月售{{ shop.monthSales }}</span>
            </div>
            <div v-if="shop.tags && shop.tags.length" class="shop-tags">
              <span v-for="tag in shop.tags" :key="tag" class="shop-tag">{{ tag }}</span>
            </div>
            <div class="shop-address text-ellipsis">{{ shop.address }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="searchKeyword && flowers.length && shops.length && !loading" class="search-result-hint">
      💐 相关花束
    </div>

    <!-- 花束列表 -->
    <div v-if="!loading && flowers.length" class="flower-list">
      <div
        v-for="item in flowers"
        :key="item.id"
        class="flower-card"
        @click="goDetail(item)"
      >
        <div class="flower-img">
          <FlowerImage :src="item.img" :emoji="flowerEmoji(item)" />
        </div>
        <div class="flower-body">
          <span class="flower-name">{{ item.name }}</span>
          <span class="flower-subtitle text-ellipsis">{{ item.subtitle }}</span>
          <div v-if="item.shopName" class="flower-shop-row">
            <span class="flower-shop-name">{{ item.shopName }}</span>
          </div>
          <div class="flower-footer">
            <div class="flower-price-row">
              <span class="price price-md">{{ money(item.price) }}</span>
              <span v-if="item._hasDiscount" class="price-original">{{ money(item.originalPrice) }}</span>
            </div>
            <div class="flower-actions">
              <div class="flower-action cart-btn" @click.stop="onAddCart(item)">+</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载更多 -->
    <div v-if="hasMore && !loading" class="load-more">
      <span class="load-text">上拉加载更多...</span>
    </div>
    <div v-else-if="!hasMore && flowers.length" class="load-more">
      <span class="load-text">—— 已经到底了 ——</span>
    </div>

    <!-- 骨架屏 -->
    <div v-if="loading" class="skeleton-grid">
      <div v-for="n in 4" :key="n" class="skeleton-card">
        <div class="skeleton" :style="{ height: rpx(280) }"></div>
        <div class="skeleton" :style="{ height: rpx(32), margin: rpx(16) }"></div>
        <div class="skeleton" :style="{ height: rpx(24), width: '60%', margin: '0 ' + rpx(16) }"></div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!loading && !flowers.length" class="empty-state">
      <span class="empty-emoji">💐</span>
      <span class="empty-text">{{ searchKeyword ? `未找到"${searchKeyword}"相关花束或花店` : '暂无花束' }}</span>
      <span class="empty-hint">{{ searchKeyword ? '换个关键词试试~' : '换个分类试试吧~' }}</span>
    </div>

    <div class="tabbar-placeholder"></div>
    <div v-if="toastText" class="twd-toast">{{ toastText }}</div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCategories, getFlowerList, searchAll } from '@/mock/api'
import { addToCart, money } from '@/store'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'

const route = useRoute()
const router = useRouter()
const rpx = n => `${n / 750}rem`

const categories = ref([])
const flowers = ref([])
const shops = ref([])
const loading = ref(true)
const hasMore = ref(false)

const activeCategory = ref(route.query.cat || '')
const sortType = ref('default')
const searchFocused = ref(false)
const searchKeyword = ref('')
const inputRef = ref(null)

const toastText = ref('')
let toastTimer = null
function toast(text) {
  toastText.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}

function flowerEmoji(item) {
  const map = {
    '1': '🌹', '2': '🌻', '3': '🕊️',
    '4': '💐', '5': '💒', '6': '💼'
  }
  return map[item.categoryId] || '🌷'
}

async function loadFlowers() {
  loading.value = true
  const res = await getFlowerList({ categoryId: activeCategory.value, sort: sortType.value })
  flowers.value = res.list
  hasMore.value = res.hasMore
  loading.value = false
}

async function loadSearch() {
  loading.value = true
  const res = await searchAll(searchKeyword.value)
  flowers.value = res.flowers
  shops.value = res.shops
  hasMore.value = false
  loading.value = false
}

function onCategoryChange(id) {
  activeCategory.value = activeCategory.value === id ? '' : id
}

function onSortChange(sort) {
  sortType.value = sort
}

function goDetail(item) {
  router.push({ name: 'detail', params: { id: item.id } })
}

function onAddCart(item) {
  addToCart(item, 1)
  toast('已加入购物车')
}

function onSearchConfirm() {
  if (!searchKeyword.value.trim()) return
  loadSearch()
}

function onSearchCancel() {
  searchFocused.value = false
  searchKeyword.value = ''
  shops.value = []
  loadFlowers()
}

watch([activeCategory, sortType], () => {
  if (!searchKeyword.value) loadFlowers()
})

watch(searchFocused, async val => {
  if (val) await nextTick(() => inputRef.value && inputRef.value.focus())
})

onMounted(async () => {
  categories.value = await getCategories()
  await loadFlowers()
})

onUnmounted(() => clearTimeout(toastTimer))
</script>

<style lang="scss" scoped>
.page {
  padding-bottom: rpx(20);
  min-height: 100vh;
}

/* 搜索栏 */
.search-section {
  padding: rpx(16) rpx(24);
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
}
.search-input {
  flex: 1;
  font-size: rpx(28);
  color: #333;
  height: rpx(72);
  border: none;
  background: transparent;
  outline: none;
  min-width: 0;
}
.search-cancel {
  font-size: rpx(28);
  color: var(--primary);
  flex-shrink: 0;
  margin-left: rpx(16);
  padding: 0 rpx(8);
}

/* 分类 Tab */
.tabs-bar {
  background: #fff;
  border-bottom: rpx(1) solid var(--border-light);
  padding-bottom: rpx(12);
}
.tabs-scroll {
  width: 100%;
  overflow-x: auto;
  white-space: nowrap;
}
.tabs-list {
  display: flex;
  padding: 0 rpx(16);
  gap: rpx(4);
}
.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: rpx(6);
  padding: rpx(16) rpx(20);
  border-radius: var(--radius-md);
  flex-shrink: 0;
  transition: all 0.3s;
}
.tab-item.active {
  background: var(--primary-light);
}
.tab-icon {
  font-size: rpx(32);
}
.tab-name {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}
.tab-item.active .tab-name {
  color: var(--primary);
  font-weight: 600;
}

/* 排序栏 */
.sort-bar {
  display: flex;
  align-items: center;
  padding: rpx(16) rpx(24);
  background: #fff;
  gap: rpx(8);
  border-bottom: rpx(1) solid var(--border-light);
}
.sort-item {
  display: flex;
  align-items: center;
  gap: rpx(4);
  padding: rpx(10) rpx(24);
  border-radius: rpx(20);
  font-size: var(--fs-body);
  color: var(--text-secondary);
  background: var(--bg);
  transition: all 0.3s;
}
.sort-item.active {
  color: var(--primary);
  background: var(--primary-light);
  font-weight: 600;
}
.sort-arrows {
  display: flex;
  flex-direction: column;
  line-height: 1;
}
.sort-arrow {
  font-size: rpx(14);
  color: var(--text-light);
}
.sort-arrow.on {
  color: var(--primary);
}

/* 花束列表 */
.flower-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: rpx(16) rpx(24);
  column-gap: rpx(16);
  row-gap: rpx(16);
}
.flower-card {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.flower-img {
  position: relative;
  height: rpx(300);
}
.flower-body {
  padding: rpx(16);
  display: flex;
  flex-direction: column;
  gap: rpx(6);
}
.flower-name {
  font-size: rpx(28);
  font-weight: 600;
  line-height: 1.3;
}
.flower-subtitle {
  font-size: var(--fs-caption);
  color: var(--text-light);
}
.flower-shop-row {
  margin-top: rpx(4);
}
.flower-shop-name {
  font-size: var(--fs-label);
  color: #FF6B6B;
}
.flower-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: rpx(8);
}
.flower-price-row {
  display: flex;
  align-items: baseline;
  gap: rpx(8);
  min-width: 0;
}
.price-md { font-size: rpx(34); }
.flower-actions {
  display: flex;
  gap: rpx(8);
}
.flower-action {
  width: rpx(56);
  height: rpx(56);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #251f1c;
  font-size: rpx(42);
  line-height: rpx(50);
  font-weight: 900;
}
.cart-btn {
  background: #FFD84D;
}

/* 加载更多 */
.load-more {
  text-align: center;
  padding: rpx(32) 0;
}
.load-text {
  font-size: var(--fs-minor);
  color: var(--text-light);
}

/* 骨架屏 */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: rpx(16) rpx(24);
  column-gap: rpx(16);
  row-gap: rpx(16);
}
.skeleton-card {
  width: 100%;
  min-width: 0;
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
}

/* 搜索结果提示 */
.search-result-hint {
  padding: rpx(16) rpx(24);
  font-size: var(--fs-minor);
  color: var(--text-light);
}

/* 花店搜索结果 */
.shop-search-section {
  padding: rpx(16) rpx(24);
}
.shop-search-title {
  font-size: rpx(28);
  font-weight: 600;
  margin-bottom: rpx(12);
}
.shop-search-list {
  display: flex;
  flex-direction: column;
  gap: rpx(12);
}
.shop-card {
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
}
.shop-cover {
  height: rpx(160);
  position: relative;
  background: linear-gradient(135deg, #E8FAF8, #FFF0F0);
  display: flex;
  align-items: center;
  justify-content: center;
}
.shop-cover-placeholder {
  font-size: rpx(64);
}
.shop-tag-new {
  position: absolute;
  top: rpx(12);
  right: rpx(12);
  background: linear-gradient(135deg, #52C41A, #73D13D);
  color: #fff;
  font-size: var(--fs-label);
  padding: rpx(4) rpx(12);
  border-radius: rpx(6);
  font-weight: 600;
}
.shop-info {
  padding: rpx(16) rpx(20);
}
.shop-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: rpx(8);
}
.shop-name {
  font-size: rpx(28);
  font-weight: 600;
  flex: 1;
  margin-right: rpx(16);
}
.shop-rating {
  font-size: var(--fs-minor);
  color: #FF9500;
  flex-shrink: 0;
}
.shop-meta-row {
  display: flex;
  align-items: center;
  gap: rpx(24);
  margin-bottom: rpx(8);
}
.shop-distance,
.shop-sales {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}
.shop-tags {
  display: flex;
  gap: rpx(8);
  margin-bottom: rpx(8);
}
.shop-tag {
  font-size: var(--fs-label);
  color: var(--secondary);
  background: var(--secondary-light);
  padding: rpx(2) rpx(12);
  border-radius: rpx(4);
}
.shop-address {
  font-size: var(--fs-caption);
  color: var(--text-light);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: rpx(120) 0;
  gap: rpx(8);
}
.empty-emoji {
  font-size: rpx(80);
}
.empty-text {
  margin-top: rpx(16);
  color: var(--text-secondary);
  font-size: var(--fs-title);
}
.empty-hint {
  font-size: var(--fs-minor);
  color: var(--text-light);
}

.tabbar-placeholder {
  height: rpx(40);
}

.twd-toast {
  position: fixed;
  left: 50%;
  bottom: rpx(220);
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
