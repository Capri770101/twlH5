<template>
  <div class="page">
    <NavBar title="购物车" />

    <!-- 有商品 -->
    <template v-if="state.cart.length">
      <div class="cart-list">
        <div v-for="group in groupedCart" :key="group.shopId" class="shop-group">
          <div class="shop-header" @click="toShop(group.shopId)">
            <span class="shop-name">{{ group.shopName }}</span>
            <span class="shop-arrow">›</span>
          </div>

          <div class="shop-items">
            <div v-for="product in group.items" :key="product.id" class="cart-item">
              <div class="cart-img">
                <FlowerImage :src="product.image" emoji="💐" />
              </div>

              <div class="cart-info">
                <span class="cart-name">{{ product.name }}</span>
                <div v-if="product.subtitle" class="cart-specs">
                  <span>{{ product.subtitle }}</span>
                </div>
                <div class="cart-price-row">
                  <span class="price price-sm">{{ money(product.price) }}</span>
                  <span v-if="product.originalPrice > product.price" class="price-original">
                    {{ money(product.originalPrice) }}
                  </span>
                </div>
                <div class="cart-quantity">
                  <button
                    class="qty-btn minus"
                    :class="{ disabled: product.quantity <= 1 }"
                    @click="changeQuantity(product.id, product.shopId, -1)"
                  >−</button>
                  <span class="qty-num">{{ product.quantity }}</span>
                  <button
                    class="qty-btn plus"
                    @click="changeQuantity(product.id, product.shopId, 1)"
                  >+</button>
                </div>
              </div>

              <button class="cart-delete" @click="removeFromCart(product.id, product.shopId)">
                <span>🗑</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部结算栏 -->
      <div class="cart-footer">
        <div class="cart-total">
          <span class="cart-total-label">合计：</span>
          <span class="price price-lg">{{ money(totalPrice) }}</span>
        </div>
        <button class="cart-checkout" @click="router.push({ name: 'checkout' })">
          去结算（{{ cartCount }}件）
        </button>
      </div>
    </template>

    <!-- 空购物车 -->
    <div v-else class="empty-state">
      <img class="empty-cart-icon" src="/images/tab-cart.png" alt="" />
      <span class="empty-title">购物车是空的</span>
      <span class="empty-desc">快去挑选心仪的花束吧~</span>
      <button class="btn btn-primary btn-lg empty-btn" @click="router.push({ name: 'home' })">
        去逛逛
      </button>
    </div>

    <div class="tabbar-placeholder"></div>
    <div v-if="toastText" class="twd-toast">{{ toastText }}</div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import state, {
  groupedCart,
  cartCount,
  totalPrice,
  changeQuantity,
  removeFromCart,
  money
} from '@/store'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'

const router = useRouter()

function toShop(id) {
  if (id && id !== 'default') router.push({ name: 'shop-detail', params: { id } })
}

const toastText = ref('')
let toastTimer = null
function toast(text) {
  toastText.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}

onUnmounted(() => clearTimeout(toastTimer))
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding-bottom: rpx(140);
}

/* 空购物车 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: rpx(80) 0;
}
.empty-cart-icon {
  display: block;
  width: rpx(100);
  height: rpx(100);
  opacity: 0.5;
}
.empty-title {
  margin-top: rpx(24);
  font-size: rpx(30);
  color: var(--text-secondary);
}
.empty-desc {
  font-size: var(--fs-minor);
  color: var(--text-light);
  margin-top: rpx(8);
}
.empty-btn {
  margin-top: rpx(32);
}

/* 商品列表 */
.cart-list {
  padding: rpx(16) rpx(24);
}
.shop-group {
  margin-bottom: rpx(16);
}
.shop-header {
  display: flex;
  align-items: center;
  padding: rpx(22) 0 rpx(12);
  gap: rpx(8);
}
.shop-name {
  font-size: rpx(28);
  font-weight: 600;
  color: #333;
}
.shop-arrow {
  font-size: var(--fs-body);
  color: #ccc;
}

.cart-item {
  display: flex;
  align-items: center;
  gap: rpx(16);
  background: #fff;
  padding: rpx(20);
  border-radius: var(--radius-md);
  margin-top: rpx(12);
  position: relative;
}
.cart-img {
  width: rpx(140);
  height: rpx(140);
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}
.cart-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: rpx(8);
  min-width: 0;
}
.cart-name {
  font-size: rpx(28);
  font-weight: 600;
}
.cart-specs {
  font-size: var(--fs-minor);
  color: #999;
  background: #f5f5f5;
  display: inline-block;
  align-self: flex-start;
  padding: rpx(4) rpx(12);
  border-radius: rpx(4);
}
.cart-price-row {
  display: flex;
  align-items: baseline;
  gap: rpx(8);
}
.price-sm { font-size: rpx(30); }
.price-lg { font-size: rpx(36); }

.cart-quantity {
  display: flex;
  align-items: center;
  gap: rpx(8);
  margin-top: rpx(4);
}
.qty-btn {
  width: rpx(48);
  height: rpx(48);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(32);
  font-weight: 600;
  background: var(--bg);
  color: var(--text-primary);
  border: none;
  padding: 0;
}
.qty-btn.disabled { opacity: 0.3; }
.qty-btn.plus {
  background: var(--primary-light);
  color: var(--primary);
}
.qty-num {
  font-size: rpx(28);
  font-weight: 600;
  min-width: rpx(48);
  text-align: center;
}

.cart-delete {
  padding: rpx(12);
  font-size: rpx(28);
  color: var(--text-light);
  border: none;
  background: transparent;
}

/* 底部结算栏（抬到 TabBar 之上） */
.cart-footer {
  position: fixed;
  bottom: calc(#{rpx(100)} + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  width: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: rpx(16) rpx(24);
  background: #fff;
  box-shadow: 0 rpx(-2) rpx(16) rgba(0, 0, 0, 0.04);
  z-index: 100;
}
.cart-total {
  display: flex;
  align-items: baseline;
  gap: rpx(4);
  flex-wrap: wrap;
}
.cart-total-label {
  font-size: rpx(28);
  color: var(--text-secondary);
}
.cart-checkout {
  padding: rpx(20) rpx(48);
  border-radius: rpx(40);
  border: none;
  background: var(--primary-gradient);
  color: #fff;
  font-size: var(--fs-title);
  font-weight: 600;
  box-shadow: var(--shadow-primary);
}
.cart-checkout:active {
  opacity: 0.85;
  transform: scale(0.98);
}

.tabbar-placeholder {
  height: rpx(120);
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
