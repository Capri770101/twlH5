<template>
  <div class="f-image" :class="{ 'is-loaded': loaded }">
    <!-- 加载中占位（骨架微光），避免图片陆续加载时布局跳动/白块 -->
    <div v-if="src && !failed && !loaded" class="f-image-ph"></div>

    <img
      v-if="!failed && src"
      class="f-image-img"
      :src="src"
      :alt="alt"
      :loading="eager ? 'eager' : 'lazy'"
      :decoding="eager ? 'sync' : 'async'"
      @load="loaded = true"
      @error="onError"
    />

    <!-- 无图 / 加载失败 → emoji 兜底 -->
    <div v-else class="f-image-fallback">
      <span class="f-image-emoji">{{ emoji }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  emoji: { type: String, default: '\u{1F338}' },
  // 首屏关键图（如详情大图）置 true：不懒加载，尽早解码
  eager: { type: Boolean, default: false }
})

const loaded = ref(false)
const failed = ref(false)

watch(() => props.src, () => {
  loaded.value = false
  failed.value = false
})

function onError() {
  failed.value = true
  loaded.value = false
}
</script>

<style lang="scss" scoped>
.f-image,
.f-image-img,
.f-image-fallback,
.f-image-ph {
  width: 100%;
  height: 100%;
}

.f-image {
  position: relative;
  overflow: hidden;
  background: #f6f3ee;
}

.f-image-ph {
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, #f6f3ee 30%, #fbf9f6 50%, #f6f3ee 70%);
  background-size: 200% 100%;
  animation: f-image-shimmer 1.2s ease-in-out infinite;
}

@keyframes f-image-shimmer {
  0% { background-position: 120% 0; }
  100% { background-position: -20% 0; }
}

.f-image-img {
  object-fit: cover;
  display: block;
  opacity: 0;
  transition: opacity 0.25s ease;
}
.f-image.is-loaded .f-image-img {
  opacity: 1;
}

.f-image-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #FFF5F0 0%, #F8F0FF 100%);
}

.f-image-emoji {
  font-size: rpx(72);
  line-height: 1;
}
</style>
