<template>
  <transition name="cp-fade">
    <div v-if="visible" class="cp-mask" @click="onMask">
      <div class="cp-sheet" @click.stop>
        <div class="cp-head">
          <span class="cp-title">选择城市</span>
          <span class="cp-close" @click="close">✕</span>
        </div>
        <p class="cp-tip">不同城市的花店不同，先选城市再挑花</p>

        <div v-if="loading" class="cp-hint">城市列表加载中…</div>
        <div v-else-if="!cities.length" class="cp-hint">城市列表暂时取不到，请稍后重试</div>
        <div v-else class="cp-grid">
          <button
            v-for="c in cities"
            :key="c.name"
            class="cp-item"
            :class="{ on: isCurrent(c.name) }"
            @click="pick(c)"
          >
            <span class="cp-name">{{ c.name }}</span>
            <span class="cp-shops">{{ c.shops }} 家门店</span>
          </button>
        </div>

        <p class="cp-foot">其他城市暂未开通配送</p>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch } from 'vue'
import store from '@/store'
import { cityList, sameCity, switchCity } from '@/utils/city'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'change'])

const visible = ref(props.modelValue)
const cities = ref([])
const loading = ref(false)

watch(
  () => props.modelValue,
  v => {
    visible.value = v
    if (v) load()
  }
)

/** 首次成功加载后不再重复请求；上次为空（接口挂了）则允许重试 */
async function load() {
  if (cities.value.length) return
  loading.value = true
  try {
    cities.value = await cityList()
  } finally {
    loading.value = false
  }
}

function isCurrent(name) {
  return sameCity(name, store.city)
}

function close() {
  visible.value = false
  emit('update:modelValue', false)
}

function onMask() {
  close()
}

function pick(c) {
  const next = switchCity(c.name)
  emit('change', next)
  close()
}
</script>

<style lang="scss" scoped>
.cp-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 400;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.cp-sheet {
  width: 100%;
  max-width: 1rem;
  box-sizing: border-box;
  background: #fff;
  border-radius: rpx(28) rpx(28) 0 0;
  padding: rpx(28) rpx(32) calc(rpx(36) + env(safe-area-inset-bottom));
  max-height: 76%;
  overflow-y: auto;
}
.cp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: rpx(8);
}
.cp-title {
  font-size: rpx(32);
  font-weight: 700;
  color: var(--text-primary);
}
.cp-close {
  font-size: rpx(30);
  color: var(--text-light);
  padding: 0 rpx(8);
}
.cp-tip {
  margin: 0 0 rpx(24);
  font-size: rpx(24);
  color: var(--text-secondary);
}
.cp-hint {
  padding: rpx(48) 0;
  text-align: center;
  font-size: rpx(26);
  color: var(--text-light);
}
.cp-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: rpx(16);
}
.cp-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: rpx(6);
  padding: rpx(20) rpx(8);
  border: 1px solid var(--border-light);
  border-radius: rpx(16);
  background: var(--bg-warm);
}
.cp-item.on {
  border-color: var(--primary);
  background: var(--primary-light);
}
.cp-name {
  font-size: rpx(28);
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.cp-item.on .cp-name {
  color: var(--primary);
  font-weight: 700;
}
.cp-shops {
  font-size: rpx(20);
  color: var(--text-light);
}
.cp-foot {
  margin: rpx(24) 0 0;
  text-align: center;
  font-size: rpx(22);
  color: var(--text-light);
}

.cp-fade-enter-active,
.cp-fade-leave-active {
  transition: opacity 0.22s ease;
}
.cp-fade-enter-from,
.cp-fade-leave-to {
  opacity: 0;
}
</style>
