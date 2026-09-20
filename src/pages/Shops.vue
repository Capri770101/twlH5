<template>
  <div class="page">
    <NavBar title="全部花店" />

    <div v-if="loading" class="loading-state">
      <div v-for="n in 4" :key="n" class="skeleton" :style="{ height: rpx(220), margin: rpx(16) + ' ' + rpx(24) }"></div>
    </div>

    <StateBlock
      v-if="!loading && loadError"
      type="error"
      emoji="😵"
      :text="loadError"
      hint="请检查网络后重试"
      @retry="loadShops"
    />

    <div v-else-if="shops.length" class="shop-list">
      <div
        v-for="shop in shops"
        :key="shop.id"
        class="shop-card"
        @click="goShop(shop.id)"
      >
        <div class="shop-cover">
          <FlowerImage :src="shop.avatar" :emoji="shop.name ? shop.name[0] : '🌸'" />
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
        <span class="shop-arrow">›</span>
      </div>
    </div>

    <div v-else class="empty-state">
      <span class="empty-emoji">🏪</span>
      <span class="empty-text">暂无入驻花店</span>
    </div>

    <!-- /shops 无 TabBar（只有 home/cart/profile 有），占位留 40rpx 即可（原为对齐 TabBar 的 120rpx，会多出一截空白） -->
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { getShopList } from '@/mock/api'
import { ensureCity } from '@/utils/city'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import StateBlock from '@/components/StateBlock.vue'
import { toast } from '@/utils/toast'

const router = useRouter()
const rpx = n => `${n / 750}rem`

const shops = ref([])
const loading = ref(true)
const loadError = ref('')

async function loadShops() {
  loading.value = true
  loadError.value = ''
  try {
    shops.value = (await getShopList(await ensureCity())) || []
  } catch (e) {
    shops.value = []
    loadError.value = (e && e.message) || '花店列表加载失败'
  } finally {
    loading.value = false
  }
}

function goShop(id) {
  router.push({ name: 'shop-detail', params: { id } })
}

onMounted(() => {
  loadShops()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(20);
}
.shop-list {
  padding: rpx(16) rpx(24);
  display: flex;
  flex-direction: column;
  gap: rpx(16);
}
.shop-card {
  display: flex;
  align-items: center;
  gap: rpx(20);
  background: #fff;
  border-radius: var(--radius-md);
  padding: rpx(20);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}
.shop-cover {
  position: relative;
  width: rpx(140);
  height: rpx(140);
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  background: linear-gradient(135deg, #E8FAF8, #FFF0F0);
}
.shop-tag-new {
  position: absolute;
  top: rpx(10);
  left: rpx(10);
  background: linear-gradient(135deg, #52C41A, #73D13D);
  color: #fff;
  font-size: var(--fs-label);
  padding: rpx(4) rpx(12);
  border-radius: rpx(6);
  font-weight: 600;
}
.shop-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: rpx(8);
}
.shop-name-row {
  display: flex;
  align-items: center;
  gap: rpx(12);
}
.shop-name {
  font-size: rpx(30);
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
}
.shop-rating { color: #FF9500; font-size: var(--fs-minor); flex-shrink: 0; }
.shop-meta-row {
  display: flex;
  align-items: center;
  gap: rpx(20);
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}
.shop-tags {
  display: flex;
  flex-wrap: wrap;
  gap: rpx(8);
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
.shop-arrow {
  color: var(--text-light);
  font-size: rpx(40);
  flex-shrink: 0;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: rpx(120) 0;
}
.empty-emoji { font-size: rpx(90); }
.empty-text { margin-top: rpx(16); color: var(--text-secondary); font-size: var(--fs-title); }
.loading-state { padding-top: rpx(16); }
</style>
