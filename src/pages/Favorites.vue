<template>
  <div class="page">
    <NavBar title="我的收藏" />

    <div v-if="favorites.length === 0" class="empty">
      <div class="empty-emoji">🌸</div>
      <div class="empty-title">还没有收藏的商品</div>
      <div class="empty-sub">逛逛花店，遇到喜欢的点击 ♡ 收藏</div>
      <button class="empty-btn" @click="router.push({ name: 'home' })">去逛逛</button>
    </div>

    <div v-else class="fav-list">
      <div class="fav-item" v-for="item in favorites" :key="item.id" @click="goDetail(item)">
        <div class="fav-img">
          <FlowerImage :src="isImageUrl(item.image) ? item.image : ''" emoji="🌷" />
        </div>
        <div class="fav-body">
          <div class="fav-name">{{ item.name }}</div>
          <div class="fav-sub" v-if="item.subtitle">{{ item.subtitle }}</div>
          <div class="fav-price">¥{{ money(item.price) }}</div>
          <div class="fav-actions" @click.stop>
            <button class="fav-btn fav-cart" @click="onAdd(item)">加入购物车</button>
            <button class="fav-btn fav-del" @click="onRemove(item)">取消收藏</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import FlowerImage from '@/components/FlowerImage.vue'
import store, { addToCart, removeFavorite, money } from '@/store'
import { toast } from '@/utils/toast'

const router = useRouter()
const favorites = store.favorites

function isImageUrl(s) {
  return /^https?:\/\//.test(s || '')
}
function goDetail(item) {
  router.push({ name: 'detail', params: { id: item.id } })
}
function onAdd(item) {
  addToCart(item, 1)
  toast('已加入购物车')
}
function onRemove(item) {
  removeFavorite(item.id)
  toast('已取消收藏')
}

</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(40);
}

/* 空态 */
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

/* 列表 */
.fav-list { padding: rpx(24); display: flex; flex-direction: column; gap: rpx(20); }
.fav-item {
  display: flex;
  gap: rpx(24);
  padding: rpx(20);
  background: #fff;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}
.fav-img {
  width: rpx(180);
  height: rpx(180);
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #f3efe9;
  display: flex;
  align-items: center;
  justify-content: center;
  img { width: 100%; height: 100%; object-fit: cover; }
}
.fav-img-emoji { font-size: rpx(80); }
.fav-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.fav-name { font-size: rpx(30); font-weight: 600; color: var(--text-primary); }
.fav-sub {
  margin-top: rpx(8);
  font-size: rpx(24);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fav-price { margin-top: rpx(12); font-size: rpx(32); font-weight: 700; color: var(--primary); }
.fav-actions { margin-top: auto; display: flex; gap: rpx(16); padding-top: rpx(12); }
.fav-btn {
  flex: 1;
  height: rpx(64);
  border-radius: rpx(999);
  font-size: rpx(24);
  font-weight: 600;
  border: none;
}
.fav-cart { background: var(--primary-gradient); color: #fff; }
.fav-del { background: #f3efe9; color: var(--text-secondary); }

</style>
