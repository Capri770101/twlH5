<template>
  <div class="page">
    <!-- 搜索头 -->
    <div class="search-header">
      <button class="back-btn" @click="onBack">‹</button>
      <div class="search-input-wrap">
        <span class="search-mark"></span>
        <input
          ref="inputRef"
          v-model="keyword"
          class="search-input"
          type="search"
          enterkeyhint="search"
          placeholder="搜索花束、花店、场景..."
          @input="onInput"
          @keyup.enter="doSearch"
        />
        <span v-if="keyword" class="clear-btn" @click="clearKeyword">✕</span>
      </div>
      <button class="search-go" @click="doSearch">搜索</button>
    </div>

    <!-- 热门搜索 -->
    <div v-if="!searched" class="hot-block">
      <div class="hot-title">热门搜索</div>
      <div class="hot-tags">
        <span v-for="h in hotWords" :key="h" class="hot-tag" @click="useHot(h)">{{ h }}</span>
      </div>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading" class="loading-state">
      <div v-for="n in 3" :key="n" class="skeleton" :style="{ height: rpx(200) }"></div>
    </div>

    <!-- 结果 -->
    <div v-if="searched && !loading" class="result-block">
      <template v-if="flowers.length || shops.length">
        <section v-if="flowers.length" class="result-section">
          <div class="result-title">花束<span class="result-count">{{ flowers.length }}</span></div>
          <div class="flower-grid">
            <div
              v-for="item in flowers"
              :key="item.id"
              class="flower-card"
              @click="toDetail(item)"
            >
              <div class="flower-img-wrap">
                <FlowerImage :src="item.img" />
                <span v-if="item.hasDiscount" class="flower-tag">-{{ item.discountRate }}%</span>
              </div>
              <div class="flower-info">
                <span class="flower-name">{{ item.name }}</span>
                <span class="flower-subtitle">{{ item.subtitle }}</span>
                <ShopTag :name="item.shopName" :city="item.shopCity" />
                <div class="flower-price-row">
                  <span class="flower-price">¥{{ yuan(item.priceText) }}</span>
                  <span v-if="item.showOriginal" class="flower-original-price">¥{{ item.originalText }}</span>
                </div>
                <span class="flower-sales">已售{{ item.salesText }}</span>
              </div>
            </div>
          </div>
        </section>

        <section v-if="shops.length" class="result-section">
          <div class="result-title">花店<span class="result-count">{{ shops.length }}</span></div>
          <div class="shop-list">
            <div
              v-for="shop in shops"
              :key="shop.id"
              class="shop-row"
              @click="toShop(shop.id)"
            >
              <div class="shop-avatar">
                <FlowerImage :src="shop.avatar" :emoji="shop.name ? shop.name[0] : '🌸'" />
              </div>
              <div class="shop-meta">
                <span class="shop-name">{{ shop.name }}</span>
                <span class="shop-sub">⭐ {{ shop.rating }}<span v-if="shop.address"> · {{ shop.address }}</span></span>
              </div>
              <span class="shop-arrow">›</span>
            </div>
          </div>
        </section>
      </template>

      <div v-else class="empty-state">
        <div class="empty-emoji">🔍</div>
        <div class="empty-text">没有找到「{{ lastKeyword }}」相关结果</div>
        <div class="empty-sub">换个关键词试试，比如「生日」「玫瑰」「向日葵」</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { searchAll } from '@/mock/api'
import FlowerImage from '@/components/FlowerImage.vue'
import ShopTag from '@/components/ShopTag.vue'
import { toast } from '@/utils/toast'
import { yuan } from '@/store'

const router = useRouter()
const rpx = n => `${n / 750}rem`

const keyword = ref('')
const lastKeyword = ref('')
const flowers = ref([])
const shops = ref([])
const loading = ref(false)
const searched = ref(false)
const inputRef = ref(null)

const hotWords = ['生日', '玫瑰', '向日葵花', '表白', '开业花篮', '长辈', '高端花礼', '家居鲜花']

let timer = null
function onInput() {
  clearTimeout(timer)
  timer = setTimeout(() => doSearch(), 350)
}

async function doSearch() {
  const kw = keyword.value.trim()
  if (!kw) {
    flowers.value = []
    shops.value = []
    searched.value = false
    return
  }
  loading.value = true
  searched.value = true
  try {
    const res = await searchAll(kw)
    flowers.value = (res && res.flowers) || []
    shops.value = (res && res.shops) || []
    lastKeyword.value = kw
  } catch (e) {
    flowers.value = []
    shops.value = []
  } finally {
    loading.value = false
  }
}

function useHot(w) {
  keyword.value = w
  doSearch()
}

function clearKeyword() {
  keyword.value = ''
  flowers.value = []
  shops.value = []
  shops.value = []
  searched.value = false
  inputRef.value && inputRef.value.focus()
}

function onBack() {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'home' })
}

function toDetail(item) {
  router.push({ name: 'detail', params: { id: item.id } })
}
function toShop(id) {
  router.push({ name: 'shop-detail', params: { id } })
}


onMounted(() => {
  inputRef.value && inputRef.value.focus()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(40);
}

/* ===== 搜索头 ===== */
.search-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: rpx(16);
  padding: rpx(16) rpx(20);
  background: #fff;
  border-bottom: rpx(1) solid var(--border-light);
}
.back-btn {
  width: rpx(64);
  height: rpx(64);
  border: none;
  background: transparent;
  font-size: rpx(56);
  line-height: 1;
  color: var(--text-primary);
  flex-shrink: 0;
}
.search-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  height: rpx(72);
  background: var(--bg);
  border-radius: rpx(36);
  padding: 0 rpx(24);
  min-width: 0;
}
.search-mark {
  width: rpx(30);
  height: rpx(30);
  border: rpx(4) solid var(--text-light);
  border-radius: 50%;
  position: relative;
  flex-shrink: 0;
  margin-right: rpx(14);
  &::after {
    content: '';
    position: absolute;
    right: rpx(-8);
    bottom: rpx(-6);
    width: rpx(14);
    height: rpx(4);
    background: var(--text-light);
    border-radius: rpx(2);
    transform: rotate(45deg);
  }
}
.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: rpx(28);
  color: var(--text-primary);
  outline: none;
}
.search-input::-webkit-search-cancel-button {
  display: none;
}
.clear-btn {
  font-size: rpx(28);
  color: var(--text-light);
  flex-shrink: 0;
  padding: 0 rpx(6);
}
.search-go {
  flex-shrink: 0;
  height: rpx(64);
  padding: 0 rpx(28);
  border: none;
  border-radius: rpx(32);
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(28);
  font-weight: 600;
}

/* ===== 热门搜索 ===== */
.hot-block {
  padding: rpx(32) rpx(24);
}
.hot-title {
  font-size: rpx(30);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: rpx(20);
}
.hot-tags {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(16);
}
.hot-tag {
  padding: rpx(14) rpx(26);
  border-radius: rpx(999);
  background: #fff;
  color: var(--text-secondary);
  font-size: rpx(26);
  box-shadow: var(--shadow-sm);
}

/* ===== 结果 ===== */
.result-block {
  padding: 0 rpx(24);
}
.result-section {
  margin-top: rpx(24);
}
.result-title {
  display: flex;
  align-items: center;
  gap: rpx(10);
  font-size: rpx(34);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: rpx(16);
}
.result-count {
  font-size: rpx(24);
  font-weight: 500;
  color: var(--text-light);
}
.flower-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: rpx(16);
}
.flower-card {
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}
.flower-img-wrap {
  position: relative;
  width: 100%;
  height: rpx(280);
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

/* ===== 花店结果 ===== */
.shop-list {
  display: flex;
  flex-direction: column;
  gap: rpx(12);
}
.shop-row {
  display: flex;
  align-items: center;
  gap: rpx(20);
  padding: rpx(16);
  background: #fff;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}
.shop-avatar {
  width: rpx(96);
  height: rpx(96);
  border-radius: rpx(16);
  overflow: hidden;
  flex-shrink: 0;
}
.shop-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: rpx(6);
}
.shop-name {
  font-size: rpx(30);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shop-sub {
  font-size: var(--fs-caption);
  color: var(--text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shop-arrow {
  font-size: rpx(40);
  color: var(--text-light);
  flex-shrink: 0;
}

/* ===== 空态 ===== */
.empty-state {
  padding: rpx(120) rpx(40);
  text-align: center;
}
.empty-emoji {
  font-size: rpx(100);
  opacity: 0.6;
}
.empty-text {
  margin-top: rpx(20);
  font-size: rpx(30);
  font-weight: 600;
  color: var(--text-secondary);
}
.empty-sub {
  margin-top: rpx(10);
  font-size: var(--fs-minor);
  color: var(--text-light);
}

/* ===== 骨架 ===== */
.loading-state {
  padding: rpx(24);
  display: flex;
  flex-direction: column;
  gap: rpx(16);
}
.skeleton {
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, #eee 25%, #f5f5f5 37%, #eee 63%);
  background-size: 400% 100%;
  animation: shimmer 1.2s ease-in-out infinite;
}
@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

</style>
