<template>
  <div class="state-block">
    <!-- 加载中 -->
    <template v-if="type === 'loading'">
      <div class="sb-spinner"></div>
      <div class="sb-text">{{ text || '加载中…' }}</div>
    </template>

    <!-- 空数据 -->
    <template v-else-if="type === 'empty'">
      <div class="sb-emoji">{{ emoji }}</div>
      <div class="sb-text">{{ text || '这里还什么都没有' }}</div>
      <div v-if="hint" class="sb-hint">{{ hint }}</div>
      <slot name="action" />
    </template>

    <!-- 加载失败 -->
    <template v-else>
      <div class="sb-emoji">{{ emoji }}</div>
      <div class="sb-text">{{ text || '加载失败' }}</div>
      <div v-if="hint" class="sb-hint">{{ hint }}</div>
      <div class="sb-acts">
        <button class="sb-btn primary" @click="$emit('retry')">重新加载</button>
        <button v-if="showBack" class="sb-btn" @click="$emit('back')">返回上一页</button>
      </div>
      <slot name="action" />
    </template>
  </div>
</template>

<script setup>
// 统一三态块：加载中 / 空数据 / 加载失败（可重试、可返回）
// 用途：替换各页面「裸 await 无 catch → 请求失败永久骨架屏或整页空白」的坑。
defineProps({
  type: { type: String, default: 'loading' }, // loading | empty | error
  text: { type: String, default: '' },
  hint: { type: String, default: '' },
  emoji: { type: String, default: '🌷' },
  showBack: { type: Boolean, default: false }
})
defineEmits(['retry', 'back'])
</script>

<style lang="scss" scoped>
.state-block {
  padding: rpx(80) rpx(40);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.sb-spinner {
  width: rpx(56);
  height: rpx(56);
  border: rpx(4) solid var(--border-light);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: sb-spin 0.8s linear infinite;
}
@keyframes sb-spin {
  to { transform: rotate(360deg); }
}
.sb-emoji {
  font-size: rpx(72);
  line-height: 1;
  margin-bottom: rpx(20);
}
.sb-text {
  font-size: rpx(28);
  color: var(--text-secondary);
}
.sb-hint {
  margin-top: rpx(10);
  font-size: rpx(22);
  color: var(--text-light);
  line-height: 1.6;
}
.sb-acts {
  margin-top: rpx(28);
  display: flex;
  gap: rpx(20);
}
.sb-btn {
  min-width: rpx(200);
  height: rpx(72);
  border: 1rpx solid var(--border);
  border-radius: 999rpx;
  background: #fff;
  color: var(--text-secondary);
  font-size: rpx(26);
  &.primary {
    border-color: transparent;
    background: var(--primary-gradient);
    color: #fff;
  }
}
</style>
