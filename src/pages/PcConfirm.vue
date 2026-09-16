<template>
  <div class="pc-confirm">
    <div class="card">
      <!-- 品牌 -->
      <div class="brand">
        <img class="brand-logo" src="/images/brand-logo.png" alt="跳舞兰" />
        <div class="brand-name">跳舞兰AI花店</div>
        <div class="brand-sub">网页版登录确认</div>
      </div>

      <!-- ① 处理中：正在完成微信授权 -->
      <div v-if="stage === 'loading'" class="stage">
        <div class="spinner" />
        <p class="tip">正在获取微信授权…</p>
      </div>

      <!-- ② 待确认：一个按钮 -->
      <div v-else-if="stage === 'ready'" class="stage">
        <div class="account">
          <img v-if="me.avatar" class="avatar" :src="me.avatar" alt="" />
          <div v-else class="avatar avatar-placeholder">💐</div>
          <div class="account-name">{{ me.nickname || '微信用户' }}</div>
        </div>

        <p class="tip tip-main">确认在电脑端登录「跳舞兰AI花店」</p>
        <p class="tip tip-sub">确认后电脑将自动登录，本页可直接关闭</p>

        <button class="confirm-btn" :disabled="submitting" @click="onConfirm">
          {{ submitting ? '确认中…' : '确认授权登录' }}
        </button>

        <p class="safe-note">🔒 仅用于登录，不会获取或修改你的其他信息</p>
      </div>

      <!-- ③ 授权成功 -->
      <div v-else-if="stage === 'done'" class="stage">
        <div class="ok-icon">✓</div>
        <p class="tip tip-main">已确认授权</p>
        <p class="tip tip-sub">电脑端正在自动登录，请回到电脑上继续操作</p>
        <p class="tip tip-sub">本页可以关闭了</p>
      </div>

      <!-- ④ 失败 -->
      <div v-else class="stage">
        <div class="err-icon">!</div>
        <p class="tip tip-main">{{ errMsg || '操作失败' }}</p>
        <p class="tip tip-sub">请在电脑上重新点击「微信扫码登录」获取新二维码</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import store, { login } from '@/store'
import {
  loginByWechat, loginByWechatPc, pcApprove, buildWechatAuthUrl, isWechatEnv, WX_APPID
} from '@/mock/api'

const route = useRoute()

const PC_TICKET_RE = /^[a-f0-9]{16,64}$/i

const stage = ref('loading')   // loading | ready | done | error
const errMsg = ref('')
const submitting = ref(false)
const me = ref({ nickname: '', avatar: '' })
let ticket = ''

/** 去掉地址栏里的 code/state，避免刷新时重复用同一个 code（一次性） */
function cleanUrl() {
  try {
    const search = location.search.replace(/[?&](code|state)=[^&]*/g, '').replace(/^&/, '?')
    history.replaceState(null, '', location.pathname + (search === '?' ? '' : search))
  } catch (e) { /* ignore */ }
}

async function onConfirm() {
  if (submitting.value || !ticket) return
  submitting.value = true
  try {
    await pcApprove(ticket)
    stage.value = 'done'
  } catch (e) {
    stage.value = 'error'
    errMsg.value = e.message || '授权失败，请重试'
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  const q = route.query
  const pc = String(q.pc || '')
  if (!PC_TICKET_RE.test(pc)) {
    stage.value = 'error'
    errMsg.value = '二维码无效或已失效'
    return
  }
  ticket = pc

  const code = String(q.code || '')
  const state = String(q.state || '')

  // A. 从微信授权回跳：先完成登录（**不自动授权**，等用户点按钮）
  if (code && (state === 'twd' || state === 'twdpc')) {
    try {
      const { userInfo, token } = state === 'twdpc'
        ? await loginByWechatPc({ code })
        : await loginByWechat({ code })
      login(userInfo, token) // 同步 store + localStorage（pcApprove 依赖本地 token）
      me.value = { nickname: userInfo.nickname || '微信用户', avatar: userInfo.avatar || '' }
      cleanUrl()
      stage.value = 'ready'
    } catch (e) {
      stage.value = 'error'
      errMsg.value = e.message || '微信授权失败'
    }
    return
  }

  // B. 已登录（手机上已有登录态）→ 直接用当前身份确认
  if (store.isLogged && store.token && !String(store.token).startsWith('mock_')) {
    const u = store.userInfo || {}
    me.value = { nickname: u.nickname || '微信用户', avatar: u.avatar || '' }
    stage.value = 'ready'
    return
  }

  // C. 未登录 → 走微信网页授权（snsapi_userinfo 有同意框），回跳到本页再确认
  if (isWechatEnv() && WX_APPID) {
    const back = location.origin + '/pc-confirm?pc=' + pc
    const url = buildWechatAuthUrl(back)
    if (url) { location.replace(url); return }
  }

  stage.value = 'error'
  errMsg.value = isWechatEnv() ? '微信登录暂不可用' : '请在手机微信中扫码打开本页面'
})
</script>

<style scoped lang="scss">
.pc-confirm {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFF4F1 0%, #F8F5F0 45%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: rpx(60) rpx(48);
  box-sizing: border-box;
}

.card {
  width: 100%;
  max-width: rpx(620);
  background: #fff;
  border-radius: rpx(28);
  box-shadow: 0 rpx(12) rpx(48) rgba(232, 97, 93, 0.12);
  padding: rpx(56) rpx(48) rpx(48);
  box-sizing: border-box;
}

/* ===== 品牌 ===== */
.brand {
  text-align: center;
  margin-bottom: rpx(44);
}
.brand-logo {
  width: rpx(120);
  height: rpx(120);
  border-radius: rpx(28);
  object-fit: cover;
}
.brand-name {
  margin-top: rpx(18);
  font-size: rpx(38);
  font-weight: 600;
  color: var(--text-primary, #2D3436);
  letter-spacing: rpx(1);
}
.brand-sub {
  margin-top: rpx(8);
  font-size: rpx(24);
  color: var(--text-light, #B2BEC3);
}

.stage {
  text-align: center;
}

/* ===== 账户 ===== */
.account {
  margin: rpx(8) 0 rpx(32);
}
.avatar {
  width: rpx(112);
  height: rpx(112);
  border-radius: 50%;
  object-fit: cover;
  display: inline-block;
  border: rpx(3) solid #fff;
  box-shadow: 0 rpx(6) rpx(20) rgba(0, 0, 0, 0.08);
}
.avatar-placeholder {
  line-height: rpx(112);
  font-size: rpx(52);
  background: var(--primary-light, #FFF0F0);
}
.account-name {
  margin-top: rpx(16);
  font-size: rpx(30);
  font-weight: 500;
  color: var(--text-primary, #2D3436);
}

/* ===== 文案 ===== */
.tip {
  font-size: rpx(26);
  color: var(--text-secondary, #636E72);
  line-height: 1.7;
  margin: 0;
}
.tip-main {
  font-size: rpx(30);
  color: var(--text-primary, #2D3436);
  font-weight: 500;
}
.tip-sub {
  margin-top: rpx(8);
  font-size: rpx(24);
  color: var(--text-light, #B2BEC3);
}

/* ===== 唯一的主按钮 ===== */
.confirm-btn {
  width: 100%;
  height: rpx(92);
  margin-top: rpx(40);
  border: none;
  border-radius: rpx(46);
  background: var(--primary-gradient, linear-gradient(135deg, #E8615D 0%, #FF8A80 100%));
  color: #fff;
  font-size: rpx(32);
  font-weight: 600;
  letter-spacing: rpx(2);
  box-shadow: 0 rpx(10) rpx(26) rgba(232, 97, 93, 0.3);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.confirm-btn:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: 0 rpx(5) rpx(14) rgba(232, 97, 93, 0.28);
}
.confirm-btn:disabled {
  opacity: 0.65;
}

.safe-note {
  margin-top: rpx(24);
  font-size: rpx(22);
  color: var(--text-light, #B2BEC3);
  line-height: 1.6;
}

/* ===== 加载 / 成功 / 失败 ===== */
.spinner {
  width: rpx(64);
  height: rpx(64);
  margin: rpx(24) auto rpx(28);
  border: rpx(6) solid var(--primary-light, #FFF0F0);
  border-top-color: var(--primary, #E8615D);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.ok-icon,
.err-icon {
  width: rpx(112);
  height: rpx(112);
  line-height: rpx(112);
  margin: rpx(8) auto rpx(28);
  border-radius: 50%;
  font-size: rpx(60);
  font-weight: 600;
  color: #fff;
}
.ok-icon {
  background: linear-gradient(135deg, #4ECDC4 0%, #44E6D3 100%);
  box-shadow: 0 rpx(8) rpx(24) rgba(78, 205, 196, 0.32);
}
.err-icon {
  background: linear-gradient(135deg, #E8615D 0%, #FF8A80 100%);
  box-shadow: 0 rpx(8) rpx(24) rgba(232, 97, 93, 0.28);
}
</style>
