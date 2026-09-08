<template>
  <div class="navbar">
    <button class="navbar-back" aria-label="返回" @click="back">
      <span class="arrow-back"></span>
    </button>
    <span class="navbar-title">{{ title }}</span>
    <span class="navbar-placeholder"></span>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

defineProps({
  title: { type: String, default: '' }
})

const router = useRouter()
const back = () => {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'home' })
}
</script>

<style lang="scss" scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: rpx(88);
  padding: 0 rpx(30);
  background: #ffffff;
}

.navbar-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: rpx(48);
  height: rpx(48);
  padding: 0;
  border: none;
  background: transparent;
  margin-left: rpx(-6);
}

.navbar-title {
  font-size: rpx(32);
  font-weight: 600;
  color: var(--text-primary);
}

.navbar-placeholder {
  width: rpx(48);
}
</style>
