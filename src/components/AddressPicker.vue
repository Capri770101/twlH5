<template>
  <transition name="addr-pop">
    <div v-if="modelValue" class="addr-mask" @click.self="close">
      <div class="addr-sheet">
        <!-- 顶部 -->
        <div class="addr-head">
          <span class="addr-close" @click="close">✕</span>
          <span class="addr-title">{{ edit ? '编辑地址' : '收货地址' }}</span>
          <span class="addr-step">{{ step }}/3</span>
        </div>

        <!-- 面包屑 -->
        <div class="addr-crumb">
          <span :class="{ on: step >= 1 }">{{ province?.name || '省 / 市' }}</span>
          <template v-if="city">
            <span class="sep">/</span>
            <span :class="{ on: step >= 2 }">{{ city.name }}</span>
          </template>
          <template v-if="district">
            <span class="sep">/</span>
            <span :class="{ on: step >= 3 }">{{ district.name }}</span>
          </template>
        </div>

        <!-- step1 省 + 市 -->
        <div v-if="step === 1" class="addr-body two-col">
          <ul class="col">
            <li
              v-for="(p, i) in provinces"
              :key="p.code"
              :class="{ active: i === pi }"
              @click="pickProvince(i)"
            >{{ p.name }}</li>
          </ul>
          <ul class="col">
            <li
              v-for="(c, i) in cityList"
              :key="c.code"
              :class="{ active: i === ci }"
              @click="ci = i"
            >{{ c.name }}</li>
          </ul>
        </div>

        <!-- step2 区 -->
        <div v-else-if="step === 2" class="addr-body one-col">
          <ul class="col">
            <li
              v-for="(d, i) in districtList"
              :key="d.code"
              :class="{ active: i === di }"
              @click="di = i"
            >{{ d.name }}</li>
          </ul>
        </div>

        <!-- step3 详细表单 -->
        <div v-else class="addr-body form">
          <div class="fld">
            <label>详细地址</label>
            <textarea v-model="form.detail" placeholder="街道、楼牌号等" maxlength="100" rows="2"></textarea>
          </div>
          <div class="fld">
            <label>收货人</label>
            <input v-model="form.name" placeholder="请输入收货人姓名" maxlength="20" />
          </div>
          <div class="fld">
            <label>手机号</label>
            <input v-model="form.phone" type="tel" inputmode="numeric" placeholder="请输入手机号" maxlength="11" />
          </div>
          <div class="fld row">
            <label>设为默认地址</label>
            <span class="switch" :class="{ on: form.isDefault }" @click="form.isDefault = !form.isDefault">
              <i></i>
            </span>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="addr-foot">
          <button v-if="step > 1" class="btn-ghost" @click="step--">上一步</button>
          <button v-if="step < 3" class="btn-primary" @click="next">下一步</button>
          <button v-else class="btn-primary" @click="save">保存</button>
        </div>

        <!-- 轻提示 -->
        <transition name="fade">
        </transition>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { provinces, getCities, getDistricts } from '@/mock/regions'
import { toast } from '@/utils/toast'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  edit: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const step = ref(1)
const pi = ref(0)
const ci = ref(0)
const di = ref(0)
const form = ref({ name: '', phone: '', detail: '', isDefault: false })

const province = computed(() => provinces[pi.value])
const cityList = computed(() => getCities(province.value?.code))
const city = computed(() => cityList.value[ci.value])
const districtList = computed(() => getDistricts(city.value?.code))
const district = computed(() => districtList.value[di.value])

function pickProvince(i) {
  pi.value = i
  ci.value = 0
  di.value = 0
}

function next() {
  if (step.value === 1) {
    if (!city.value) return toast('请选择城市')
    step.value = 2
  } else if (step.value === 2) {
    if (!district.value) return toast('请选择区')
    step.value = 3
  }
}

function save() {
  const f = form.value
  if (!f.detail.trim()) return toast('请填写详细地址')
  if (!f.name.trim()) return toast('请填写收货人')
  if (!/^1\d{10}$/.test(f.phone.trim())) return toast('手机号格式不正确')
  const addr = {
    id: props.edit?.id || 'addr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: f.name.trim(),
    phone: f.phone.trim(),
    province: province.value.name,
    city: city.value.name,
    district: district.value.name,
    // region = 省市区（下单接口与后端 orders.addr_region 读取该字段，缺了订单地址会不完整）
    region: province.value.name + city.value.name + district.value.name,
    provinceCode: province.value.code,
    cityCode: city.value.code,
    districtCode: district.value.code,
    detail: f.detail.trim(),
    isDefault: !!f.isDefault,
    full: province.value.name + city.value.name + district.value.name + f.detail.trim()
  }
  emit('confirm', addr)
  close()
}

function close() {
  emit('update:modelValue', false)
}


function reset() {
  step.value = 1
  pi.value = 0
  ci.value = 0
  di.value = 0
  form.value = { name: '', phone: '', detail: '', isDefault: false }
}

function prefill(a) {
  const pIdx = provinces.findIndex(p => p.code === a.provinceCode)
  pi.value = pIdx >= 0 ? pIdx : 0
  const cs = getCities(province.value.code)
  const cIdx = cs.findIndex(c => c.code === a.cityCode)
  ci.value = cIdx >= 0 ? cIdx : 0
  const ds = getDistricts(city.value.code)
  const dIdx = ds.findIndex(d => d.code === a.districtCode)
  di.value = dIdx >= 0 ? dIdx : 0
  form.value = {
    name: a.name || '',
    phone: a.phone || '',
    detail: a.detail || '',
    isDefault: !!a.isDefault
  }
  step.value = 1
}

watch(
  () => props.modelValue,
  v => {
    if (v) {
      if (props.edit) prefill(props.edit)
      else reset()
    }
  }
)
</script>

<style scoped lang="scss">
.addr-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.addr-sheet {
  width: 1rem;
  max-width: 480px;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  position: relative;
}
.addr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: rpx(88);
  padding: 0 rpx(24);
  border-bottom: 1rpx solid #f0f0f0;
  flex-shrink: 0;
}
.addr-close {
  font-size: rpx(32);
  color: #999;
  width: rpx(60);
}
.addr-title {
  font-size: rpx(32);
  font-weight: 600;
  color: #333;
}
.addr-step {
  font-size: rpx(24);
  color: #999;
  width: rpx(60);
  text-align: right;
}
.addr-crumb {
  display: flex;
  align-items: center;
  gap: rpx(8);
  padding: rpx(20) rpx(24);
  font-size: rpx(26);
  color: #bbb;
  flex-shrink: 0;
  .on {
    color: var(--primary);
    font-weight: 600;
  }
  .sep {
    color: #ddd;
  }
}
.addr-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.two-col {
  display: flex;
  .col {
    flex: 1;
    &:first-child {
      background: #f7f7f7;
    }
  }
}
.one-col {
  .col {
    width: 100%;
  }
}
.col {
  list-style: none;
  margin: 0;
  padding: 0;
  li {
    height: rpx(88);
    line-height: rpx(88);
    padding: 0 rpx(28);
    font-size: rpx(28);
    color: #444;
    &.active {
      color: var(--primary);
      font-weight: 600;
      background: #fff;
    }
  }
}
.form {
  padding: rpx(20) rpx(28);
}
.fld {
  margin-bottom: rpx(28);
  label {
    display: block;
    font-size: rpx(24);
    color: #999;
    margin-bottom: rpx(12);
  }
  textarea,
  input {
    width: 100%;
    border: none;
    background: #f7f7f7;
    border-radius: var(--radius-sm);
    padding: rpx(20);
    font-size: rpx(28);
    color: #333;
    box-sizing: border-box;
    outline: none;
    &::placeholder {
      color: #c0c0c0;
    }
  }
  textarea {
    resize: none;
    line-height: 1.5;
  }
  &.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    label {
      margin: 0;
    }
  }
}
.switch {
  width: rpx(88);
  height: rpx(48);
  border-radius: rpx(24);
  background: #ddd;
  position: relative;
  transition: background 0.2s;
  i {
    position: absolute;
    top: rpx(4);
    left: rpx(4);
    width: rpx(40);
    height: rpx(40);
    border-radius: 50%;
    background: #fff;
    transition: left 0.2s;
  }
  &.on {
    background: var(--primary);
    i {
      left: rpx(44);
    }
  }
}
.addr-foot {
  display: flex;
  gap: rpx(20);
  padding: rpx(20) rpx(24);
  padding-bottom: calc(#{rpx(20)} + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f0f0f0;
  flex-shrink: 0;
  button {
    flex: 1;
    height: rpx(88);
    border-radius: rpx(44);
    font-size: rpx(30);
    font-weight: 600;
    border: none;
  }
  .btn-ghost {
    background: #f2f2f2;
    color: #666;
  }
  .btn-primary {
    background: var(--primary-gradient);
    color: #fff;
  }
}
.mini-toast {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: rpx(26);
  padding: rpx(18) rpx(28);
  border-radius: rpx(12);
  z-index: 10;
}
.addr-pop-enter-active,
.addr-pop-leave-active {
  transition: opacity 0.25s;
  .addr-sheet {
    transition: transform 0.25s;
  }
}
.addr-pop-enter-from,
.addr-pop-leave-to {
  opacity: 0;
  .addr-sheet {
    transform: translateY(100%);
  }
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
