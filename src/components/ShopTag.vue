<template>
  <!-- 商品卡上的店铺归属标识。无店铺名时整块不渲染，避免出现空行。 -->
  <span v-if="name" class="shop-tag">
    <span class="shop-tag-name">{{ name }}</span>
    <span v-if="city" class="shop-tag-city">{{ city }}</span>
  </span>
</template>

<script setup>
// 纯展示组件：列表接口（/api/flowers）本身带 shopName / shopCity，无需额外请求。
defineProps({
  name: { type: String, default: '' },
  city: { type: String, default: '' }
})
</script>

<style scoped lang="scss">
.shop-tag {
  display: inline-flex;
  align-items: center;
  gap: rpx(6);
  max-width: 100%;
  min-width: 0;
  /* 比价格红更柔和，避免和 ¥ 抢视线 */
  color: #b8564f;
  font-size: var(--fs-label);
  line-height: 1.4;
}
/* 小标签块，替代图标 —— 不引入图片资源，缩放稳定 */
.shop-tag::before {
  content: '';
  flex: none;
  width: rpx(8);
  height: rpx(8);
  border-radius: rpx(2);
  background: #e8615d;
  opacity: 0.5;
}
.shop-tag-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shop-tag-city {
  flex: none;
  padding: 0 rpx(6);
  border-radius: rpx(4);
  background: #fff0f0;
  color: #b8564f;
  font-size: rpx(18);
}
</style>
