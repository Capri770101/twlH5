<template>
  <transition name="toast-fade">
    <div v-if="toastText" class="global-toast">{{ toastText }}</div>
  </transition>
</template>

<script setup>
// 全站唯一的 toast 宿主（挂载在 App.vue）。位置固定在屏幕中下部，避免各页面样式不一。
import { toastText } from '@/utils/toast'
</script>

<style lang="scss" scoped>
.global-toast {
  position: fixed;
  left: 50%;
  top: 45%;
  transform: translateX(-50%);
  z-index: 2000;
  max-width: rpx(560);
  padding: rpx(18) rpx(30);
  border-radius: rpx(12);
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  font-size: rpx(26);
  line-height: 1.5;
  text-align: center;
  pointer-events: none;
}
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
}
</style>
