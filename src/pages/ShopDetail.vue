<template>
  <div class="page twd-app shop-detail" v-if="shop">
    <NavBar :title="shop.name" />

    <!-- ===== Hero ===== -->
    <div class="hero">
      <div class="hero-cover">
        <span class="hero-emoji">🌸</span>
      </div>
      <div class="hero-shade"></div>

      <div class="service-ribbon">
        <span class="ribbon-text">{{ shop.brandSlogan }} ›</span>
      </div>

      <div class="brand-card">
        <div class="brand-head">
          <div class="shop-avatar">
            <FlowerImage :src="shop.avatar" :emoji="shop.name ? shop.name[0] : '花'" />
          </div>
          <div class="shop-main-info">
            <div class="shop-name-row">
              <span class="shop-name">{{ shop.name }}</span>
              <span v-if="shop.isNew" class="shop-new-badge">新店</span>
            </div>
            <div class="shop-ip-card">
              <span class="shop-ip-eyebrow">{{ shop.ipTitle }}</span>
              <span class="shop-ip-text">{{ shop.ipText }}</span>
            </div>
          </div>
        </div>

        <div class="shop-contact-list">
          <div class="shop-contact-row" @click="copyText(shop.address, '已复制地址')">
            <span class="shop-contact-icon location-pin"></span>
            <span class="shop-contact-label">地址</span>
            <span class="shop-contact-value text-ellipsis">{{ shop.address || '商家暂未填写' }}</span>
            <span class="shop-contact-action">导航</span>
          </div>
          <a class="shop-contact-row" :href="shop.phone ? 'tel:' + shop.phone : null" @click="onPhoneTap">
            <span class="shop-contact-icon">☎</span>
            <span class="shop-contact-label">订花电话</span>
            <span class="shop-contact-value">{{ shop.phone || '商家暂未填写' }}</span>
            <span class="shop-contact-action">拨打</span>
          </a>
          <div class="shop-contact-row" @click="copyText(shop.wechat || shop.phone, '已复制联系方式')">
            <span class="shop-contact-icon wechat-icon"><i></i><i></i></span>
            <span class="shop-contact-label">微信</span>
            <span class="shop-contact-value">微信 / 二维码</span>
            <span class="shop-contact-action">查看</span>
          </div>
        </div>

        <div class="shop-service-note">{{ shop.serviceNote }}</div>
      </div>
    </div>

    <!-- ===== Tabs ===== -->
    <div class="tabs">
      <div class="tab" :class="{ active: activeTab === 'home' }" @click="activeTab = 'home'"><span>首页</span></div>
      <div class="tab" :class="{ active: activeTab === 'goods' }" @click="activeTab = 'goods'"><span>全部商品</span></div>
      <div class="tab" :class="{ active: activeTab === 'reviews' }" @click="loadReviews"><span>{{ shop.reviewTabText }}</span></div>
      <div class="tab" :class="{ active: activeTab === 'contact' }" @click="activeTab = 'contact'"><span>商家</span></div>
    </div>

    <div class="content">
      <!-- 首页 -->
      <div v-show="activeTab === 'home'" class="panel">
        <div class="trust-row">
          <div class="trust-item">
            <span class="trust-num">{{ shop.displayRating }}</span>
            <span class="trust-label">评分</span>
          </div>
          <div class="trust-divider"></div>
          <div class="trust-item">
            <span class="trust-num">{{ shop.displaySales }}</span>
            <span class="trust-label">销量</span>
          </div>
          <div class="trust-divider"></div>
          <div class="trust-item">
            <span class="trust-num">{{ shop.deliveryTime }}</span>
            <span class="trust-label">送达</span>
          </div>
        </div>

        <div class="featured-swiper" v-if="featured.length">
          <div class="featured-track" :style="{ transform: `translateX(-${featuredIndex * 100}%)` }">
            <div v-for="item in featured" :key="item.id" class="featured-slide" @click="goDetail(item)">
              <div class="featured-img">
                <FlowerImage :src="item.img" emoji="✿" />
                <div class="featured-gradient"></div>
              </div>
              <div class="featured-copy">
                <span class="featured-kicker">本店精选</span>
                <span class="featured-name text-ellipsis">{{ item.name }}</span>
                <div class="featured-row">
                  <span class="featured-price">¥{{ money(item.price) }}</span>
                  <span class="featured-action">立即订购 ›</span>
                </div>
              </div>
            </div>
          </div>
          <div class="featured-dots">
            <span v-for="(f, i) in featured" :key="i" class="dot" :class="{ on: i === featuredIndex }"></span>
          </div>
        </div>

        <div class="section-title-mini">本店推荐</div>
        <div class="goods-grid">
          <GoodsCard v-for="item in flowers.slice(0, 4)" :key="item.id" :item="item" @tap="goDetail(item)" @add="addItem(item)" />
        </div>
      </div>

      <!-- 全部商品 -->
      <div v-show="activeTab === 'goods'" class="panel">
        <div class="cat-chips hide-scrollbar">
          <div v-for="c in categories" :key="c.id" class="cat-chip" :class="{ active: currentCat === c.id }" @click="currentCat = c.id">
            {{ c.name }}
          </div>
        </div>
        <div class="goods-grid">
          <GoodsCard
            v-for="item in filteredFlowers"
            :key="item.id"
            :item="item"
            @tap="goDetail(item)"
            @add="addItem(item)"
          />
        </div>
        <div v-if="!filteredFlowers.length" class="empty-mini">该分类暂无商品</div>
      </div>

      <!-- 评价 -->
      <div v-show="activeTab === 'reviews'" class="panel">
        <div class="review-summary">
          <span class="review-score">{{ shop.displayRating }}</span>
          <span class="review-count">共 {{ shop.ratingCount }} 条评价</span>
        </div>
        <div v-if="reviews.length" class="review-list">
          <div v-for="(r, i) in reviews" :key="i" class="review-item">
            <div class="review-head">
              <span class="review-user">{{ r.user }}</span>
              <span class="review-stars">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</span>
            </div>
            <p class="review-content">{{ r.content }}</p>
            <div class="review-tags">
              <span v-for="t in r.tags" :key="t" class="review-tag">{{ t }}</span>
            </div>
            <span class="review-date">{{ r.date }}</span>
          </div>
        </div>
        <div v-else class="empty-mini">商家暂未开放评价</div>
      </div>

      <!-- 商家 -->
      <div v-show="activeTab === 'contact'" class="panel">
        <div class="merchant-block">
          <div class="merchant-row"><span class="m-label">营业时间</span><span class="m-value">{{ shop.businessHours || '暂无' }}</span></div>
          <div class="merchant-row"><span class="m-label">配送时长</span><span class="m-value">{{ shop.deliveryTime }}（免配送费）</span></div>
          <div class="merchant-row"><span class="m-label">起送价</span><span class="m-value">¥{{ money(shop.minOrderPrice) }}</span></div>
          <div class="merchant-row"><span class="m-label">门店地址</span><span class="m-value">{{ shop.address }}</span></div>
        </div>
        <div class="merchant-desc">{{ shop.description }}</div>
        <div class="merchant-tags">
          <span v-for="t in shop.tags" :key="t" class="merchant-tag">{{ t }}</span>
        </div>
      </div>
    </div>

    <!-- ===== 底部操作栏（上抬至 TabBar 之上） ===== -->
    <div class="fixed-bottom shop-bar" :style="{ bottom: 'calc(100 * var(--rpx) + env(safe-area-inset-bottom))' }">
      <div class="shop-bar-cart" @click="goCart">
        <span class="cart-ico">🛒</span>
        <span v-if="cartCount" class="cart-badge">{{ cartCount }}</span>
        <span class="cart-total">¥{{ money(totalPrice) }}</span>
      </div>
      <button class="btn-primary shop-bar-btn" @click="goCart">去购物车</button>
    </div>

    <!-- 轻提示 -->
    <transition name="fade">
      <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getShopDetail, getShopReviews } from '@/mock/api'
import { addToCart, cartCount, totalPrice, money } from '@/store'
import FlowerImage from '@/components/FlowerImage.vue'
import NavBar from '@/components/NavBar.vue'
import GoodsCard from '@/components/GoodsCard.vue'

const route = useRoute()
const router = useRouter()

const shop = ref(null)
const flowers = ref([])
const featured = ref([])
const categories = ref([])
const reviews = ref([])
const activeTab = ref('home')
const currentCat = ref('')
const featuredIndex = ref(0)
const toastMsg = ref('')
let featuredTimer = null
let toastTimer = null

const filteredFlowers = computed(() => {
  if (!currentCat.value) return flowers.value
  return flowers.value.filter(f => (f.categoryId || 'other') === currentCat.value)
})

function showToast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toastMsg.value = ''), 1600)
}

function copyText(text, okMsg) {
  const v = String(text || '').trim()
  if (!v) { showToast('商家暂未填写'); return }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(v).then(() => showToast(okMsg)).catch(() => showToast(okMsg))
  } else {
    showToast(okMsg)
  }
}

function onPhoneTap() {
  if (!shop.value || !shop.value.phone) showToast('商家暂未填写电话')
}

function addItem(item) {
  addToCart({
    id: item.id,
    name: item.name,
    subtitle: item.subtitle || '',
    images: item.images || (item.img ? [item.img] : []),
    image: item.img || '',
    price: item.price,
    originalPrice: item.originalPrice || 0,
    shopId: shop.value.id,
    shopName: shop.value.name,
    shopAddress: shop.value.address
  })
  showToast('已加入购物车')
}

function goDetail(item) {
  router.push({
    name: 'detail',
    params: { id: item.id },
    query: { shopId: shop.value.id, shopName: shop.value.name, shopAddress: shop.value.address }
  })
}

function goCart() {
  router.push({ name: 'cart' })
}

async function loadReviews() {
  activeTab.value = 'reviews'
  if (reviews.value.length) return
  reviews.value = await getShopReviews(shop.value.id)
}

onMounted(async () => {
  const data = await getShopDetail(route.params.id)
  if (!data) { showToast('店铺不存在'); return }
  shop.value = data.shop
  flowers.value = data.flowers
  featured.value = data.featured
  categories.value = data.categories
  document.title = data.shop.name
  if (featured.value.length > 1) {
    featuredTimer = setInterval(() => {
      featuredIndex.value = (featuredIndex.value + 1) % featured.value.length
    }, 3500)
  }
})

onUnmounted(() => {
  clearInterval(featuredTimer)
  clearTimeout(toastTimer)
})
</script>

<style scoped lang="scss">
.shop-detail { padding-bottom: calc(200rpx + env(safe-area-inset-bottom)); background: var(--bg); }

/* ===== Hero ===== */
.hero { position: relative; }
.hero-cover {
  height: rpx(360);
  background: linear-gradient(135deg, #E8615D 0%, #FF8A80 60%, #FFD3C9 100%);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.hero-emoji { font-size: rpx(160); opacity: 0.9; filter: drop-shadow(0 4rpx 8rpx rgba(0,0,0,0.1)); }
.hero-shade {
  position: absolute; left: 0; right: 0; top: rpx(220);
  height: rpx(200);
  background: linear-gradient(180deg, rgba(248,245,240,0) 0%, var(--bg) 92%);
  pointer-events: none;
}
.service-ribbon {
  position: absolute; top: rpx(28); left: rpx(24); right: rpx(24);
  z-index: 3;
}
.ribbon-text {
  display: inline-block;
  font-size: rpx(22); color: #fff;
  background: rgba(0,0,0,0.22);
  padding: rpx(8) rpx(20);
  border-radius: var(--radius-pill);
  backdrop-filter: blur(4px);
}
.brand-card {
  position: relative; z-index: 2;
  margin: rpx(-90) rpx(24) 0;
  background: #fff;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: rpx(28);
}
.brand-head { display: flex; align-items: flex-start; gap: rpx(20); }
.shop-avatar {
  width: rpx(104); height: rpx(104); border-radius: var(--radius-md);
  overflow: hidden; flex-shrink: 0;
  background: var(--primary-light);
  box-shadow: var(--shadow-sm);
  :deep(img) { width: 100%; height: 100%; object-fit: cover; }
}
.shop-main-info { flex: 1; min-width: 0; }
.shop-name-row { display: flex; align-items: center; gap: rpx(12); }
.shop-name { font-size: rpx(34); font-weight: 700; color: var(--text-primary); }
.shop-new-badge {
  font-size: rpx(20); color: #fff; background: var(--primary);
  padding: rpx(2) rpx(12); border-radius: var(--radius-pill);
}
.shop-ip-card {
  margin-top: rpx(12);
  background: var(--primary-light);
  border-radius: var(--radius-md);
  padding: rpx(14) rpx(18);
}
.shop-ip-eyebrow { display: block; font-size: rpx(22); color: var(--primary-dark); font-weight: 600; }
.shop-ip-text { display: block; margin-top: rpx(4); font-size: rpx(22); color: var(--text-secondary); line-height: 1.5; }

.shop-contact-list { margin-top: rpx(24); }
.shop-contact-row {
  display: flex; align-items: center; gap: rpx(16);
  padding: rpx(18) 0;
  border-top: 1px solid var(--border-light);
  font-size: rpx(26); color: var(--text-primary);
  text-decoration: none;
}
.shop-contact-label { width: rpx(120); color: var(--text-secondary); flex-shrink: 0; }
.shop-contact-value { flex: 1; min-width: 0; color: var(--text-primary); }
.shop-contact-action { color: var(--primary); font-weight: 600; flex-shrink: 0; }
.shop-contact-icon { width: rpx(36); height: rpx(36); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--primary); }
.wechat-icon {
  position: relative;
  i { position: absolute; width: rpx(6); height: rpx(6); border-radius: 50%; background: currentColor; }
  i:first-child { left: rpx(12); top: rpx(12); }
  i:last-child { right: rpx(12); top: rpx(12); }
}
.shop-service-note {
  margin-top: rpx(16);
  font-size: rpx(22); color: var(--primary-dark);
  background: var(--primary-light);
  border-radius: var(--radius-md);
  padding: rpx(14) rpx(18);
  line-height: 1.5;
}

/* ===== Tabs ===== */
.tabs {
  position: sticky; top: rpx(88); z-index: 5;
  display: flex;
  background: #fff;
  border-bottom: 1px solid var(--border-light);
  margin-top: rpx(20);
}
.tab {
  flex: 1; text-align: center;
  padding: rpx(24) 0;
  font-size: rpx(26); color: var(--text-secondary);
  position: relative;
}
.tab.active { color: var(--primary); font-weight: 700; }
.tab.active::after {
  content: ''; position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
  width: rpx(48); height: rpx(6); border-radius: var(--radius-pill);
  background: var(--primary);
}

/* ===== 内容面板 ===== */
.panel { padding: rpx(24); }
.trust-row {
  display: flex; align-items: center;
  background: #fff; border-radius: var(--radius-md);
  padding: rpx(24) 0; box-shadow: var(--shadow-sm);
}
.trust-item { flex: 1; text-align: center; }
.trust-num { display: block; font-size: rpx(30); font-weight: 700; color: var(--text-primary); }
.trust-label { font-size: rpx(22); color: var(--text-light); }
.trust-divider { width: 1px; height: rpx(48); background: var(--border-light); }

.featured-swiper {
  position: relative; margin-top: rpx(24);
  border-radius: var(--radius-lg); overflow: hidden;
  box-shadow: var(--shadow-md);
}
.featured-track { display: flex; transition: transform 0.4s ease; }
.featured-slide { position: relative; flex: 0 0 100%; }
.featured-img { position: relative; height: rpx(320); background: var(--bg-warm); }
.featured-img :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.featured-gradient { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.5) 100%); }
.featured-copy { position: absolute; left: rpx(28); right: rpx(28); bottom: rpx(28); color: #fff; }
.featured-kicker { font-size: rpx(20); opacity: 0.9; }
.featured-name { display: block; font-size: rpx(32); font-weight: 700; margin: rpx(6) 0; }
.featured-row { display: flex; align-items: center; justify-content: space-between; }
.featured-price { font-size: rpx(34); font-weight: 700; }
.featured-action { font-size: rpx(24); background: rgba(255,255,255,0.22); padding: rpx(6) rpx(16); border-radius: var(--radius-pill); }
.featured-dots { position: absolute; bottom: rpx(14); left: 50%; transform: translateX(-50%); display: flex; gap: rpx(8); }
.featured-dots .dot { width: rpx(10); height: rpx(10); border-radius: 50%; background: rgba(255,255,255,0.5); }
.featured-dots .dot.on { background: #fff; width: rpx(22); }

.section-title-mini { margin: rpx(32) rpx(4) rpx(16); font-size: rpx(28); font-weight: 700; color: var(--text-primary); }

/* 商品网格 */
.goods-grid {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: rpx(20);
}

/* 分类 chips */
.cat-chips { display: flex; gap: rpx(16); overflow-x: auto; padding-bottom: rpx(8); margin-bottom: rpx(16); }
.cat-chip {
  flex-shrink: 0;
  font-size: rpx(24); color: var(--text-secondary);
  background: #fff; border: 1px solid var(--border);
  padding: rpx(10) rpx(24); border-radius: var(--radius-pill);
}
.cat-chip.active { color: #fff; background: var(--primary); border-color: var(--primary); }

/* 评价 */
.review-summary { display: flex; align-items: baseline; gap: rpx(16); padding: rpx(8) 0 rpx(16); }
.review-score { font-size: rpx(44); font-weight: 700; color: var(--primary); }
.review-count { font-size: rpx(24); color: var(--text-light); }
.review-item { background: #fff; border-radius: var(--radius-md); padding: rpx(20); margin-bottom: rpx(16); box-shadow: var(--shadow-sm); }
.review-head { display: flex; align-items: center; justify-content: space-between; }
.review-user { font-size: rpx(24); color: var(--text-secondary); }
.review-stars { color: #FFB400; font-size: rpx(24); letter-spacing: rpx(2); }
.review-content { margin: rpx(10) 0; font-size: rpx(26); color: var(--text-primary); line-height: 1.5; }
.review-tags { display: flex; flex-wrap: wrap; gap: rpx(10); }
.review-tag { font-size: rpx(20); color: var(--primary-dark); background: var(--primary-light); padding: rpx(4) rpx(14); border-radius: var(--radius-pill); }
.review-date { display: block; margin-top: rpx(10); font-size: rpx(20); color: var(--text-light); }

/* 商家 */
.merchant-block { background: #fff; border-radius: var(--radius-md); padding: rpx(8) rpx(20); box-shadow: var(--shadow-sm); }
.merchant-row { display: flex; gap: rpx(20); padding: rpx(18) 0; border-bottom: 1px solid var(--border-light); font-size: rpx(26); }
.merchant-row:last-child { border-bottom: none; }
.m-label { width: rpx(140); color: var(--text-secondary); flex-shrink: 0; }
.m-value { flex: 1; color: var(--text-primary); }
.merchant-desc { margin-top: rpx(20); font-size: rpx(26); color: var(--text-secondary); line-height: 1.6; }
.merchant-tags { display: flex; flex-wrap: wrap; gap: rpx(12); margin-top: rpx(16); }
.merchant-tag { font-size: rpx(22); color: var(--primary-dark); background: var(--primary-light); padding: rpx(6) rpx(18); border-radius: var(--radius-pill); }

.empty-mini { text-align: center; color: var(--text-light); font-size: rpx(24); padding: rpx(60) 0; }

/* 底部栏 */
.shop-bar {
  display: flex; align-items: center; gap: rpx(20);
  position: fixed; left: 50%; transform: translateX(-50%); width: 1rem;
  background: #fff; box-shadow: 0 calc(-4 * var(--rpx)) calc(16 * var(--rpx)) rgba(0,0,0,0.08);
  padding: rpx(16) rpx(24);
  box-sizing: border-box;
}
.shop-bar-cart { position: relative; display: flex; align-items: center; gap: rpx(8); flex: 1; }
.cart-ico { font-size: rpx(40); }
.cart-badge {
  position: absolute; left: rpx(34); top: rpx(-6);
  min-width: rpx(28); height: rpx(28); padding: 0 rpx(6);
  background: var(--primary); color: #fff;
  font-size: rpx(18); border-radius: var(--radius-pill);
  display: flex; align-items: center; justify-content: center;
}
.cart-total { font-size: rpx(30); font-weight: 700; color: var(--text-primary); }
.shop-bar-btn {
  flex-shrink: 0;
  border: none; border-radius: var(--radius-pill);
  background: var(--primary-gradient); color: #fff;
  font-size: rpx(28); font-weight: 600;
  padding: rpx(18) rpx(48);
}

/* 轻提示 */
.toast {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.78); color: #fff;
  font-size: rpx(26); padding: rpx(18) rpx(32); border-radius: var(--radius-md);
  z-index: 99;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
