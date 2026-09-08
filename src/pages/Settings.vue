<template>
  <div class="page">
    <NavBar title="账户设置" />

    <!-- 头像 -->
    <div class="avatar-card" @click="showPicker = true">
      <div class="av-big">
        <img v-if="isImageUrl(avatar)" :src="avatar" alt="" />
        <span v-else>{{ avatar || '🌸' }}</span>
      </div>
      <div class="av-meta">
        <div class="av-name">{{ nickname || '未设置昵称' }}</div>
        <div class="av-tip">点击更换头像</div>
      </div>
      <span class="av-arrow">›</span>
    </div>

    <!-- 资料表单 -->
    <div class="form card">
      <div class="row">
        <span class="label">昵称</span>
        <input
          class="value-input"
          v-model="nickname"
          maxlength="20"
          placeholder="请输入昵称"
        />
      </div>

      <div class="row">
        <span class="label">性别</span>
        <div class="gender-group">
          <button
            class="g-btn"
            :class="{ active: gender === 0 }"
            @click="gender = 0"
          >保密</button>
          <button
            class="g-btn"
            :class="{ active: gender === 1 }"
            @click="gender = 1"
          >男</button>
          <button
            class="g-btn"
            :class="{ active: gender === 2 }"
            @click="gender = 2"
          >女</button>
        </div>
      </div>

      <div class="row">
        <span class="label">手机号</span>
        <span class="value-text">{{ phoneMasked }}</span>
      </div>
    </div>

    <p class="hint">手机号通过登录时绑定，不可在此修改。</p>

    <button class="save-btn" @click="onSave">保存修改</button>

    <!-- 头像选择弹层 -->
    <div v-if="showPicker" class="sheet-mask" @click="showPicker = false"></div>
    <div v-if="showPicker" class="sheet" @click.stop>
      <div class="sheet-title">选择头像</div>
      <div class="emoji-grid">
        <button
          v-for="a in PRESET_AVATARS"
          :key="a"
          class="emoji-item"
          :class="{ active: a === avatar }"
          @click="pickAvatar(a)"
        >{{ a }}</button>
      </div>
      <div class="url-line">
        <input
          class="url-input"
          v-model="urlInput"
          placeholder="或粘贴头像图片链接 https://…"
        />
        <button class="url-btn" @click="applyUrl">使用</button>
      </div>
      <button class="sheet-cancel" @click="showPicker = false">取消</button>
    </div>

    <div v-if="toastText" class="twd-toast">{{ toastText }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import NavBar from '@/components/NavBar.vue'
import store, { updateUserInfo } from '@/store'

const user = computed(() => store.userInfo || {})
const nickname = ref(user.value.nickname || '')
const gender = ref(Number(user.value.gender) || 0)
const avatar = ref(user.value.avatar || '')

const phoneMasked = computed(() => {
  const p = user.value.phone || ''
  return p ? p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '未绑定'
})

const PRESET_AVATARS = ['🌸', '🌻', '💐', '🌹', '🌷', '🌼', '💮', '🏵️', '🌺', '🌿']
const showPicker = ref(false)
const urlInput = ref('')

function isImageUrl(s) {
  return /^https?:\/\//.test(s || '')
}

function pickAvatar(a) {
  avatar.value = a
  showPicker.value = false
}

function applyUrl() {
  const u = urlInput.value.trim()
  if (!isImageUrl(u)) { toast('请输入以 http(s):// 开头的图片链接'); return }
  avatar.value = u
  urlInput.value = ''
  showPicker.value = false
}

function onSave() {
  const n = nickname.value.trim()
  if (!n) { toast('昵称不能为空'); return }
  updateUserInfo({ nickname: n, gender: gender.value, avatar: avatar.value })
  toast('已保存')
}

const toastText = ref('')
let toastTimer = null
function toast(text) {
  toastText.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: rpx(40);
}

/* 头像卡 */
.avatar-card {
  display: flex;
  align-items: center;
  gap: rpx(24);
  margin: rpx(24);
  padding: rpx(32) rpx(28);
  background: #fff;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}
.av-big {
  width: rpx(120);
  height: rpx(120);
  border-radius: 50%;
  background: var(--bg-warm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(64);
  overflow: hidden;
  flex-shrink: 0;
  img { width: 100%; height: 100%; object-fit: cover; }
}
.av-meta { flex: 1; min-width: 0; }
.av-name {
  font-size: rpx(32);
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.av-tip { margin-top: rpx(8); font-size: rpx(24); color: var(--text-light); }
.av-arrow { font-size: rpx(40); color: var(--text-light); }

/* 表单 */
.form {
  margin: rpx(24);
  border-radius: var(--radius-md);
  overflow: hidden;
  padding: 0 rpx(28);
}
.row {
  display: flex;
  align-items: center;
  min-height: rpx(100);
  &:active { background: var(--bg-warm); }
}
.row + .row { border-top: rpx(1) solid var(--border-light); }
.label {
  width: rpx(140);
  flex-shrink: 0;
  font-size: rpx(28);
  color: var(--text-secondary);
}
.value-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: rpx(28);
  color: var(--text-primary);
  text-align: right;
  &::placeholder { color: var(--text-light); }
}
.value-text {
  flex: 1;
  text-align: right;
  font-size: rpx(28);
  color: var(--text-primary);
}
.gender-group {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  gap: rpx(16);
}
.g-btn {
  border: rpx(1) solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  font-size: rpx(26);
  padding: rpx(10) rpx(28);
  border-radius: rpx(999);
  &.active {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--bg-warm);
  }
}

.hint {
  margin: rpx(16) rpx(36) 0;
  font-size: rpx(22);
  color: var(--text-light);
  line-height: 1.5;
}

.save-btn {
  display: block;
  width: calc(100% - #{rpx(48)});
  margin: rpx(48) rpx(24) 0;
  height: rpx(92);
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(32);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

/* 头像选择弹层 */
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 150;
}
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 151;
  background: #fff;
  border-radius: rpx(28) rpx(28) 0 0;
  padding: rpx(32) rpx(32) rpx(40);
  box-sizing: border-box;
  max-width: 1rem;
  margin: 0 auto;
}
.sheet-title {
  font-size: rpx(30);
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  margin-bottom: rpx(24);
}
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: rpx(16);
}
.emoji-item {
  height: rpx(96);
  border: rpx(1) solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg);
  font-size: rpx(48);
  display: flex;
  align-items: center;
  justify-content: center;
  &.active {
    border-color: var(--primary);
    background: var(--bg-warm);
  }
}
.url-line {
  display: flex;
  align-items: center;
  gap: rpx(16);
  margin-top: rpx(28);
}
.url-input {
  flex: 1;
  height: rpx(80);
  border: rpx(1) solid var(--border);
  border-radius: var(--radius-md);
  padding: 0 rpx(20);
  font-size: rpx(26);
  outline: none;
  &::placeholder { color: var(--text-light); }
}
.url-btn {
  flex-shrink: 0;
  border: none;
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(26);
  padding: rpx(18) rpx(32);
  border-radius: var(--radius-md);
}
.sheet-cancel {
  width: 100%;
  height: rpx(88);
  margin-top: rpx(28);
  border: none;
  border-radius: var(--radius-md);
  background: var(--bg);
  color: var(--text-secondary);
  font-size: rpx(30);
  font-weight: 600;
}

.twd-toast {
  position: fixed;
  left: 50%;
  top: 45%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  font-size: rpx(26);
  padding: rpx(18) rpx(30);
  border-radius: rpx(12);
  z-index: 200;
  max-width: rpx(560);
  text-align: center;
}
</style>
