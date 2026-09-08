<template>
  <transition name="am-pop">
    <div v-if="modelValue" class="am-mask" @click.self="close">
      <div class="am-sheet">
        <div class="am-head">
          <span class="am-close" @click="close">✕</span>
          <span class="am-title">收货地址</span>
        </div>

        <!-- 列表模式 -->
        <div v-if="!showForm" class="am-body">
          <div v-if="!store.addresses.length" class="am-empty">
            <p>暂无收货地址</p>
            <span>添加地址后，下单时可直接选择</span>
          </div>
          <ul class="am-list">
            <li v-for="a in store.addresses" :key="a.id" @click="onPick(a)">
              <div class="am-row1">
                <span class="am-name">{{ a.name }}</span>
                <span class="am-phone">{{ a.phone }}</span>
                <span v-if="a.isDefault" class="am-tag">默认</span>
              </div>
              <div class="am-row2">{{ a.full }}</div>
              <div class="am-ops">
                <span v-if="!a.isDefault" @click.stop="onSetDefault(a)">设为默认</span>
                <span @click.stop="onEdit(a)">编辑</span>
                <span @click.stop="onDelete(a)">删除</span>
              </div>
            </li>
          </ul>
        </div>

        <!-- 表单模式（内嵌三步选择器） -->
        <AddressPicker
          v-else
          v-model="showForm"
          :edit="editAddr"
          @confirm="onFormConfirm"
        />

        <!-- 底部新增 -->
        <div v-if="!showForm" class="am-foot">
          <button class="am-add" @click="onAdd">＋ 新增收货地址</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue'
import AddressPicker from '@/components/AddressPicker.vue'
import store, {
  addAddress,
  removeAddress,
  setDefaultAddress,
  selectAddress
} from '@/store'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  selectMode: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue', 'select'])

const showForm = ref(false)
const editAddr = ref(null)

function close() {
  emit('update:modelValue', false)
}

function onPick(a) {
  if (props.selectMode) {
    selectAddress(a)
    emit('select', a)
    close()
  } else {
    setDefaultAddress(a.id)
  }
}

function onAdd() {
  editAddr.value = null
  showForm.value = true
}

function onEdit(a) {
  editAddr.value = a
  showForm.value = true
}

function onDelete(a) {
  removeAddress(a.id)
}

function onSetDefault(a) {
  setDefaultAddress(a.id)
}

function onFormConfirm(addr) {
  addAddress(addr)
  if (props.selectMode) {
    selectAddress(addr)
    emit('select', addr)
    close()
  } else {
    showForm.value = false
  }
}
</script>

<style scoped lang="scss">
.am-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.am-sheet {
  width: 1rem;
  max-width: 480px;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.am-head {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  height: rpx(88);
  border-bottom: 1rpx solid #f0f0f0;
  flex-shrink: 0;
}
.am-close {
  position: absolute;
  left: rpx(24);
  font-size: rpx(32);
  color: #999;
}
.am-title {
  font-size: rpx(32);
  font-weight: 600;
  color: #333;
}
.am-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: #f7f7f7;
}
.am-empty {
  text-align: center;
  padding: rpx(120) rpx(40);
  p {
    font-size: rpx(30);
    color: #666;
    margin: 0 0 rpx(12);
  }
  span {
    font-size: rpx(24);
    color: #aaa;
  }
}
.am-list {
  list-style: none;
  margin: 0;
  padding: rpx(20);
  li {
    background: #fff;
    border-radius: var(--radius-md);
    padding: rpx(24);
    margin-bottom: rpx(20);
    box-shadow: var(--shadow-sm);
  }
}
.am-row1 {
  display: flex;
  align-items: center;
  gap: rpx(16);
  margin-bottom: rpx(10);
}
.am-name {
  font-size: rpx(30);
  font-weight: 600;
  color: #333;
}
.am-phone {
  font-size: rpx(26);
  color: #666;
}
.am-tag {
  font-size: rpx(20);
  color: var(--primary);
  border: 1rpx solid var(--primary);
  border-radius: rpx(6);
  padding: 0 rpx(8);
  line-height: rpx(30);
}
.am-row2 {
  font-size: rpx(26);
  color: #555;
  line-height: 1.4;
  margin-bottom: rpx(16);
}
.am-ops {
  display: flex;
  gap: rpx(30);
  justify-content: flex-end;
  span {
    font-size: rpx(24);
    color: #999;
  }
}
.am-foot {
  padding: rpx(20) rpx(24);
  padding-bottom: calc(#{rpx(20)} + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f0f0f0;
  flex-shrink: 0;
}
.am-add {
  width: 100%;
  height: rpx(88);
  border: none;
  border-radius: rpx(44);
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(30);
  font-weight: 600;
}
.am-pop-enter-active,
.am-pop-leave-active {
  transition: opacity 0.25s;
}
.am-pop-enter-from,
.am-pop-leave-to {
  opacity: 0;
}
</style>
