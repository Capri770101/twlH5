<template>
  <div class="f-image">
    <img
      v-if="!failed && src"
      class="f-image-img"
      :src="src"
      :alt="alt"
      loading="lazy"
      @error="failed = true"
    />
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
  emoji: { type: String, default: '\u{1F338}' }
})

const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
</script>

<style lang="scss" scoped>
.f-image,
.f-image-img,
.f-image-fallback {
  width: 100%;
  height: 100%;
}

.f-image {
  position: relative;
  overflow: hidden;
}

.f-image-img {
  object-fit: cover;
  display: block;
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
