<template>
  <div class="goods-card" @click="$emit('tap')">
    <div class="goods-card-img">
      <FlowerImage :src="item.img" emoji="✿" />
    </div>
    <div class="goods-card-body">
      <span class="goods-card-name">{{ item.name }}</span>
      <span v-if="item.subtitle" class="goods-card-sub">{{ item.subtitle }}</span>
      <div class="goods-card-foot">
        <span class="goods-card-price">¥{{ money(item.price) }}</span>
        <button class="goods-card-add" @click.stop="$emit('add')">＋</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { money } from '@/store'
import FlowerImage from './FlowerImage.vue'

defineProps({ item: { type: Object, required: true } })
defineEmits(['tap', 'add'])
</script>

<style scoped lang="scss">
.goods-card {
  background: #fff;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}
.goods-card-img {
  position: relative;
  height: rpx(280);
  background: var(--bg-warm);
  :deep(img) { width: 100%; height: 100%; object-fit: cover; }
}
.goods-card-body {
  padding: rpx(16);
  display: flex;
  flex-direction: column;
  flex: 1;
}
.goods-card-name {
  font-size: rpx(26);
  color: var(--text-primary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.goods-card-sub {
  margin-top: rpx(6);
  font-size: rpx(22);
  color: var(--text-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.goods-card-foot {
  margin-top: rpx(12);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.goods-card-price {
  color: var(--primary);
  font-weight: 700;
  font-size: rpx(30);
}
.goods-card-add {
  width: rpx(48);
  height: rpx(48);
  border-radius: 50%;
  background: var(--primary-gradient);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(36);
  font-weight: 600;
  border: none;
  line-height: 1;
}
</style>
