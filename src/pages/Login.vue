<template>
  <div class="page">
    <NavBar title="登录 · 注册" />

    <div class="brand">
      <div class="brand-logo">🌸</div>
      <div class="brand-name">跳舞兰AI花店</div>
      <div class="brand-sub">用一束花，表达每一份心意</div>
    </div>

    <div class="form">
      <!-- ===== PC 扫码面板（点「微信扫码登录」后覆盖表单） ===== -->
      <div v-if="!wechatEnv && pcView === 'qr'" class="qr-panel">
        <div class="qr-head">
          <span class="qr-title">微信扫码登录</span>
          <span class="qr-switch" @click="backToForm">返回登录 ›</span>
        </div>
        <template v-if="pcUseQrconnect">
          <button class="login-btn wechat" :class="{ disabled: !agreed }" @click="onQrconnectLogin">
            <span class="wb-icon">💬</span> 微信扫码登录
          </button>
        </template>
        <template v-else>
          <div class="qr-box">
            <img v-if="pcQrData" :src="pcQrData" class="qr-img" alt="微信登录二维码" />
            <div v-else class="qr-loading">二维码生成中…</div>
            <div v-if="pcQrExpired" class="qr-expired">
              <div>二维码已失效</div>
              <button class="qr-refresh" @click="genPcQr">刷新二维码</button>
            </div>
          </div>
          <div class="qr-hint">
            请使用手机微信「扫一扫」<br />在手机上点击「确认授权登录」后，电脑将自动登录
            <span v-if="isMobileEnv" class="qr-hint-sub">（或用另一台设备扫码 / 复制链接到微信打开）</span>
          </div>
          <button v-if="isMobileEnv" class="qr-copy" @click="onCopyLink">复制链接到微信打开</button>
        </template>
        <button class="qr-back" @click="backToForm">← 返回登录</button>
      </div>

      <!-- ===== 主表单（扫码时不显示） ===== -->
      <template v-else>
        <!-- 登录 / 注册 切换 -->
        <div class="mode-tabs">
          <button :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</button>
          <button :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</button>
        </div>

        <!-- ---------------- 登录 ---------------- -->
        <template v-if="mode === 'login'">
          <div class="sub-tabs">
            <button :class="{ active: loginTab === 'password' }" @click="loginTab = 'password'">账号密码</button>
            <button :class="{ active: loginTab === 'sms' }" @click="loginTab = 'sms'">验证码登录</button>
          </div>

          <!-- 账号密码登录 -->
          <template v-if="loginTab === 'password'">
            <div class="field">
              <span class="field-icon">👤</span>
              <input class="field-input" type="text" autocomplete="username"
                     v-model="account" placeholder="请输入账号或手机号" />
            </div>
            <div class="field">
              <span class="field-icon">🔒</span>
              <input class="field-input" type="password" autocomplete="current-password"
                     v-model="password" placeholder="请输入密码" @keyup.enter="onPasswordLogin" />
            </div>
            <button class="login-btn" :class="{ disabled: !canPwdLogin }" @click="onPasswordLogin">登录</button>
          </template>

          <!-- 手机号验证码登录 -->
          <template v-else>
            <div class="field">
              <span class="field-icon">📱</span>
              <input class="field-input" type="tel" inputmode="numeric" maxlength="11"
                     v-model="phone" placeholder="请输入手机号" />
            </div>
            <div class="field">
              <span class="field-icon">🔑</span>
              <input class="field-input" type="tel" inputmode="numeric" maxlength="6"
                     v-model="code" placeholder="请输入验证码" />
              <button class="code-btn" :class="{ disabled: sending }" :disabled="sending" @click="onSendCode('login')">
                {{ sending ? countdown + 's 后重发' : '获取验证码' }}
              </button>
            </div>
            <button class="login-btn" :class="{ disabled: !canPhoneLogin }" @click="onPhoneLogin">登录</button>
          </template>

          <div class="divider"><span>或</span></div>

          <!-- 微信内：一键授权（snsapi_userinfo 完整授权） -->
          <template v-if="wechatEnv">
            <button class="login-btn wechat" :class="{ disabled: !agreed }" @click="onWechatLogin">
              <span class="wb-icon">💬</span> 微信一键登录
            </button>
            <p class="env-tip">检测到微信环境，将使用微信授权登录</p>
          </template>

          <!-- PC / 外部浏览器：点这里才切到二维码，并覆盖上方表单 -->
          <button v-else class="login-btn wechat" @click="showPcQrView">
            <span class="wb-icon">💬</span> 微信扫码登录
          </button>
        </template>

        <!-- ---------------- 注册 ---------------- -->
        <template v-else>
          <div class="field">
            <span class="field-icon">👤</span>
            <input class="field-input" type="text" maxlength="20" autocomplete="username"
                   v-model="regUsername" placeholder="设置账号（字母开头，4-20 位）" />
          </div>
          <div class="field">
            <span class="field-icon">🔒</span>
            <input class="field-input" type="password" maxlength="32" autocomplete="new-password"
                   v-model="regPassword" placeholder="设置密码（6-32 位）" />
          </div>
          <div class="field">
            <span class="field-icon">🔒</span>
            <input class="field-input" type="password" maxlength="32" autocomplete="new-password"
                   v-model="regPassword2" placeholder="确认密码" />
          </div>
          <div class="field">
            <span class="field-icon">📱</span>
            <input class="field-input" type="tel" inputmode="numeric" maxlength="11"
                   v-model="regPhone" placeholder="请输入手机号（用于绑定）" />
          </div>
          <div class="field">
            <span class="field-icon">🔑</span>
            <input class="field-input" type="tel" inputmode="numeric" maxlength="6"
                   v-model="regCode" placeholder="请输入短信验证码" />
            <button class="code-btn" :class="{ disabled: sending }" :disabled="sending" @click="onSendCode('register')">
              {{ sending ? countdown + 's 后重发' : '获取验证码' }}
            </button>
          </div>
          <button class="login-btn" :class="{ disabled: !canRegister }" @click="onRegister">注册并登录</button>
          <p class="env-tip">注册即绑定手机号，支持账号密码 / 手机号验证码登录</p>
        </template>
      </template>
    </div>

    <div class="agreement" @click="agreed = !agreed">
      <span class="checkbox" :class="{ checked: agreed }">{{ agreed ? '✓' : '' }}</span>
      <span class="agree-text">我已阅读并同意</span>
      <span class="agree-link" @click.stop="openAgreement('service')">《用户服务协议》</span>
      <span class="agree-text">和</span>
      <span class="agree-link" @click.stop="openAgreement('privacy')">《隐私政策》</span>
    </div>


    <div v-if="showAgreement" class="modal-mask" @click="showAgreement = false">
      <div class="modal-content agreement-modal" @click.stop>
        <div class="am-title">{{ agreementTitle }}</div>
        <div class="am-body">{{ agreementText }}</div>
        <button class="am-btn" @click="showAgreement = false">我已知晓</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'
import NavBar from '@/components/NavBar.vue'
import { login } from '@/store'
import store from '@/store'
import {
  loginByWechat, loginByWechatPc, loginByPhone, loginByPassword, registerAccount, sendSmsCode,
  isWechatEnv, buildWechatAuthUrl, buildWechatPcAuthUrl, fetchAuthConfig,
  pcStatus, genPcTicket, WX_APPID
} from '@/mock/api'
import { toast } from '@/utils/toast'

const route = useRoute()
const router = useRouter()

const agreed = ref(false)
const sending = ref(false)
const countdown = ref(60)
const submitting = ref(false)
const wechatEnv = isWechatEnv()
let timer = null

// ===== 视图状态：登录 / 注册；登录方式：账号密码 / 验证码 =====
const mode = ref('login')          // 'login' | 'register'
const loginTab = ref('password')   // 'password' | 'sms'

// 账号密码登录
const account = ref('')
const password = ref('')

// 手机号验证码登录
const phone = ref('')
const code = ref('')

// 注册
const regUsername = ref('')
const regPassword = ref('')
const regPassword2 = ref('')
const regPhone = ref('')
const regCode = ref('')

const phoneRe = /^1[3-9]\d{9}$/
const phoneValid = computed(() => phoneRe.test(phone.value))
const canPhoneLogin = computed(() => phoneValid.value && /^\d{6}$/.test(code.value))
const canPwdLogin = computed(() => !!account.value.trim() && !!password.value)

const usernameValid = computed(() => /^[a-zA-Z][a-zA-Z0-9_]{3,19}$/.test(regUsername.value.trim()))
const regPwdValid = computed(() => regPassword.value.length >= 6 && regPassword.value.length <= 32)
const regPhoneValid = computed(() => phoneRe.test(regPhone.value))
const canRegister = computed(() =>
  usernameValid.value && regPwdValid.value && regPassword.value === regPassword2.value &&
  regPhoneValid.value && /^\d{6}$/.test(regCode.value)
)

function switchMode(m) {
  mode.value = m
  if (m === 'register') backToForm() // 注册时关掉扫码面板
}

function onSendCode(scene = 'login') {
  if (sending.value) return
  const target = scene === 'register' ? regPhone.value : phone.value
  if (!phoneRe.test(target)) { toast('请输入正确的手机号'); return }
  sending.value = true
  countdown.value = 60
  sendSmsCode(target).then(r => {
    toast(r && r.debug && r.code ? `验证码已发送（测试码：${r.code}）` : '验证码已发送')
    timer = setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0) {
        clearInterval(timer); timer = null
        sending.value = false
      }
    }, 1000)
  }).catch(() => {
    sending.value = false
    toast('发送失败，请重试')
  })
}

async function onPhoneLogin() {
  if (!agreed.value) { toast('请先阅读并同意协议'); return }
  if (!canPhoneLogin.value) { toast('请输入手机号和验证码'); return }
  if (submitting.value) return
  submitting.value = true
  try {
    const { userInfo, token } = await loginByPhone(phone.value, code.value)
    finishLogin(userInfo, token)
  } catch (e) {
    toast(e.message || '登录失败')
  } finally { submitting.value = false }
}

async function onPasswordLogin() {
  if (!agreed.value) { toast('请先阅读并同意协议'); return }
  const acc = account.value.trim()
  if (!acc) { toast('请输入账号或手机号'); return }
  if (!password.value) { toast('请输入密码'); return }
  if (submitting.value) return
  submitting.value = true
  try {
    const { userInfo, token } = await loginByPassword(acc, password.value)
    finishLogin(userInfo, token)
  } catch (e) {
    toast(e.message || '登录失败')
  } finally { submitting.value = false }
}

async function onRegister() {
  if (!agreed.value) { toast('请先阅读并同意协议'); return }
  if (!usernameValid.value) { toast('账号需字母开头，4-20 位字母/数字/下划线'); return }
  if (!regPwdValid.value) { toast('密码长度需 6-32 位'); return }
  if (regPassword.value !== regPassword2.value) { toast('两次输入的密码不一致'); return }
  if (!regPhoneValid.value) { toast('请输入正确的手机号'); return }
  if (!/^\d{6}$/.test(regCode.value)) { toast('请输入 6 位短信验证码'); return }
  if (submitting.value) return
  submitting.value = true
  try {
    const { userInfo, token } = await registerAccount({
      username: regUsername.value.trim(),
      password: regPassword.value,
      phone: regPhone.value,
      code: regCode.value
    })
    finishLogin(userInfo, token)
  } catch (e) {
    toast(e.message || '注册失败')
  } finally { submitting.value = false }
}

async function onWechatLogin() {
  if (!agreed.value) { toast('请先阅读并同意协议'); return }
  // 微信内 + 已配置 appId → 跳公众号网页授权 snsapi_userinfo，回跳后由后端 code 换 openid
  // ⚠️ 硬策略：无 code / 网络失败一律抛错，绝不静默建账号（详见 api.js loginByWechat）
  if (wechatEnv && WX_APPID) {
    const authUrl = buildWechatAuthUrl(location.href)
    if (authUrl) { location.href = authUrl; return }
  }
  toast('微信授权未配置，请联系运营')
}

function finishLogin(userInfo, token) {
  login(userInfo, token)
  toast(mode.value === 'register' ? '注册成功' : '登录成功')
  const redirect = route.query.redirect
  setTimeout(() => {
    if (redirect) router.replace(redirect)
    else router.replace({ name: 'profile' })
  }, 800)
}

function openAgreement(type) {
  showAgreement.value = true
  if (type === 'service') {
    agreementTitle.value = '用户服务协议'
    agreementText.value = '欢迎使用跳舞兰AI花店。我们将依据本协议为您提供服务，包括商品浏览、下单、支付、配送及售后。您完成下单即视为同意相关交易条款。'
  } else {
    agreementTitle.value = '隐私政策'
    agreementText.value = '我们仅收集提供服务所必需的个人信息（如手机号、收货地址），用于订单履约与配送。我们不会向无关第三方泄露您的个人信息。'
  }
}

const showAgreement = ref(false)
const agreementTitle = ref('')
const agreementText = ref('')

// ===== PC 端微信登录：二维码内嵌登录框 =====
// 方案 A（开放平台 qrconnect，后端配好 WX_OPEN_APPID 后自动优先）→ 按钮跳微信官方扫码页；
// 方案 B（H5 扫码中转，即刻可用）→ 登录框内直接渲染二维码并轮询票据。
// ⚠️ 硬策略：两条路都是用户主动扫码授权，绝不静默建账号。
const pcQrData = ref('')
const pcQrExpired = ref(false)
const pcUrl = ref('')
const pcUseQrconnect = ref(false) // 方案 A 可用时改为官方扫码页
const pcView = ref('form')        // 'form' 表单 | 'qr' 扫码（切换后覆盖表单）
const isMobileEnv = /android|iphone|ipad|ipod|windows phone|mobile/i.test(navigator.userAgent || '')
let pcPollTimer = null

function stopPcPoll() {
  if (pcPollTimer) { clearInterval(pcPollTimer); pcPollTimer = null }
}

// 生成二维码并开始轮询（内嵌展示）
async function genPcQr() {
  const ticket = genPcTicket()
  pcQrExpired.value = false
  // 手机扫码后打开的是「确认授权登录」页（不再自动授权，必须用户点按钮确认）
  pcUrl.value = location.origin + '/pc-confirm?pc=' + ticket
  try {
    pcQrData.value = await QRCode.toDataURL(pcUrl.value, { width: 320, margin: 1 })
  } catch (e) {
    toast('二维码生成失败，请重试')
    return
  }
  stopPcPoll()
  const startAt = Date.now()
  pcPollTimer = setInterval(async () => {
    if (Date.now() - startAt > 5 * 60 * 1000) { // 票据 TTL 5 分钟
      stopPcPoll(); pcQrExpired.value = true; return
    }
    try {
      const d = await pcStatus(ticket)
      if (d && d.status === 'approved' && d.token) {
        stopPcPoll()
        const u = d.user || {}
        finishLogin({
          id: String(u.id || ''),
          nickname: u.nickname || '微信用户',
          avatar: u.avatar || '',
          phone: u.phone || '',
          openid: u.openid || '',
          guest: !!u.guest
        }, d.token)
      }
    } catch (e) { /* 轮询瞬时失败静默重试 */ }
  }, 2000)
}

// 方案 A：跳微信开放平台官方扫码页（配好 WX_OPEN_APPID 后启用）
async function onQrconnectLogin() {
  if (!agreed.value) { toast('请先阅读并同意协议'); return }
  const cfg = await fetchAuthConfig()
  const authUrl = (cfg && cfg.pcWechatReady && cfg.wxOpenAppid)
    ? buildWechatPcAuthUrl(location.href, cfg.wxOpenAppid)
    : ''
  if (authUrl) { location.href = authUrl; return }
  pcUseQrconnect.value = false
  genPcQr()
}

// 点「微信扫码登录」→ 切换到扫码视图（覆盖表单）并出码
async function showPcQrView() {
  pcView.value = 'qr'
  const cfg = await fetchAuthConfig()
  if (cfg && cfg.pcWechatReady && cfg.wxOpenAppid) {
    pcUseQrconnect.value = true // 方案 A：官方扫码页（用户点按钮再跳）
    return
  }
  genPcQr() // 方案 B：内嵌二维码 + 轮询
}

// 返回表单：停止轮询 + 清掉二维码态
function backToForm() {
  stopPcPoll()
  pcQrExpired.value = false
  pcQrData.value = ''
  pcUseQrconnect.value = false
  pcView.value = 'form'
}

async function onCopyLink() {
  const text = pcUrl.value || location.href
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // 旧浏览器降级：临时 textarea
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    toast('链接已复制，去微信粘贴打开')
  } catch (e) {
    toast('复制失败，请手动选择链接复制')
  }
}

// 微信授权回跳：微信内 ?code=xxx&state=twd → loginByWechat；PC 开放平台 ?code=xxx&state=twdpc → loginByWechatPc
async function wechatLoginByCode(code, state) {
  try {
    const clean = location.href.split('?')[0] + (location.search.replace(/[?&](code|state|pc)=[^&]*/g, '').replace(/^&/, '?'))
    history.replaceState(null, '', clean)
    const { userInfo, token } = state === 'twdpc'
      ? await loginByWechatPc({ code })   // PC 开放平台扫码（unionid 跨端归一）
      : await loginByWechat({ code })     // 微信内公众号网页授权
    finishLogin(userInfo, token)
  } catch (e) {
    toast(e.message || '微信登录失败，请重试')
  }
}

onMounted(() => {
  const q = route.query
  // 手机扫 PC 二维码：统一交给 /pc-confirm 处理（登录 + 用户点确认后才授权）
  // ⚠️ 必须在 code 分支之前判断，且转发全部 query（可能已带 code/state 从微信回跳而来）
  if (q.pc) {
    router.replace({ path: '/pc-confirm', query: q })
    return
  }
  if (q.code && (q.state === 'twd' || q.state === 'twdpc')) {
    wechatLoginByCode(String(q.code), String(q.state))
    return
  }
  // 带 redirect：PC 扫码支付的兜底通道会把二维码指向 /login?redirect=/pay/xxx
  if (q.redirect) {
    // 已登录（手机微信里通常授权过）→ 直接去目标页
    if (store.isLogged && store.token && !String(store.token).startsWith('mock_')) {
      router.replace(String(q.redirect))
      return
    }
    // 未登录且在微信内 → 自动走网页授权（snsapi_userinfo，有同意框、非静默），
    // 回跳后由上面的 code 分支完成登录并跳转
    if (wechatEnv && WX_APPID) {
      const authUrl = buildWechatAuthUrl(location.href)
      if (authUrl) { location.href = authUrl; return }
    }
    return
  }
  // 注：PC 端二维码改为「点微信扫码登录」后才出码（不再自动出码），见 showPcQrView
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  stopPcPoll()
})
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 rpx(60);
  box-sizing: border-box;
}

/* 品牌区 */
.brand {
  margin-top: rpx(100);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: rpx(16);
}
.brand-logo {
  width: rpx(140);
  height: rpx(140);
  border-radius: 50%;
  background: var(--bg-warm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: rpx(72);
  box-shadow: var(--shadow-sm);
}
.brand-name {
  font-size: rpx(40);
  font-weight: 700;
  color: var(--text-primary);
}
.brand-sub {
  font-size: rpx(24);
  color: var(--text-light);
}

/* 表单 */
.form {
  width: 100%;
  margin-top: rpx(56);
}

/* 登录 / 注册 切换 */
.mode-tabs {
  display: flex;
  width: 100%;
  margin-bottom: rpx(36);
  border-bottom: rpx(1) solid var(--border-light);
}
.mode-tabs button {
  flex: 1;
  border: none;
  background: transparent;
  font-size: rpx(30);
  color: var(--text-light);
  padding: rpx(18) 0;
  position: relative;
  &.active {
    color: var(--text-primary);
    font-weight: 700;
    &::after {
      content: '';
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: rpx(-1);
      width: rpx(80);
      height: rpx(4);
      border-radius: rpx(4);
      background: var(--primary);
    }
  }
}

/* 登录方式切换（账号密码 / 验证码） */
.sub-tabs {
  display: flex;
  gap: rpx(16);
  justify-content: center;
  margin-bottom: rpx(28);
}
.sub-tabs button {
  border: rpx(1) solid var(--border-light);
  background: #fff;
  color: var(--text-secondary);
  font-size: rpx(24);
  padding: rpx(10) rpx(28);
  border-radius: 999rpx;
  &.active {
    border-color: var(--primary);
    color: var(--primary);
    background: #fdf3f0;
  }
}

.field {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: var(--radius-md);
  padding: 0 rpx(24);
  height: rpx(96);
  box-shadow: var(--shadow-sm);
  margin-bottom: rpx(24);
}
.field-icon {
  font-size: rpx(34);
  margin-right: rpx(16);
}
.field-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: rpx(28);
  color: var(--text-primary);
  &::placeholder { color: var(--text-light); }
}
.code-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: rpx(26);
  padding-left: rpx(16);
  &.disabled { color: var(--text-light); }
}

.login-btn {
  width: 100%;
  height: rpx(96);
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(32);
  font-weight: 600;
  margin-top: rpx(8);
  &.disabled { opacity: 0.5; }
  &.wechat {
    background: #07C160;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: rpx(10);
  }
}
.wb-icon { font-size: rpx(34); }

.divider {
  display: flex;
  align-items: center;
  color: var(--text-light);
  font-size: rpx(22);
  margin: rpx(36) 0;
  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border-light);
  }
  span { padding: 0 rpx(20); }
}
.env-tip {
  margin: rpx(16) 0 0;
  text-align: center;
  font-size: rpx(22);
  color: var(--text-light);
}

/* 协议 */
.agreement {
  margin-top: rpx(40);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  font-size: rpx(22);
  color: var(--text-light);
  max-width: rpx(560);
}
.checkbox {
  width: rpx(30);
  height: rpx(30);
  border: rpx(1) solid var(--border);
  border-radius: rpx(6);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: rpx(8);
  color: #fff;
  font-size: rpx(20);
  &.checked { background: var(--primary); border-color: var(--primary); }
}
.agree-text { color: var(--text-light); }
.agree-link { color: var(--primary); }

/* 协议弹窗 */
.agreement-modal {
  width: rpx(600);
  max-height: rpx(800);
  overflow-y: auto;
}

/* 登录框内嵌微信扫码区（PC / 外部浏览器） */
.qr-panel {
  margin-top: rpx(8);
  padding: rpx(32) rpx(24) rpx(28);
  background: #fff;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.qr-title {
  font-size: rpx(30);
  font-weight: 700;
  color: var(--text-primary);
}
.qr-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: rpx(16);
}
.qr-switch {
  flex: none;
  font-size: rpx(24);
  color: var(--primary);
  padding: rpx(8) rpx(16);
  border: 1rpx solid rgba(217, 116, 95, 0.35);
  border-radius: 999rpx;
  background: #fdf3f0;
}
.qr-box {
  position: relative;
  margin-top: rpx(24);
  width: rpx(320);
  height: rpx(320);
  border: 1rpx solid var(--border-light);
  border-radius: rpx(16);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #fff;
}
.qr-img {
  width: 100%;
  height: 100%;
  display: block;
}
.qr-loading {
  font-size: rpx(24);
  color: var(--text-light);
}
.qr-expired {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.96);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: rpx(18);
  font-size: rpx(26);
  color: var(--text-secondary);
}
.qr-refresh {
  border: none;
  border-radius: 999rpx;
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(25);
  padding: rpx(14) rpx(36);
}
.qr-hint {
  margin-top: rpx(20);
  text-align: center;
  font-size: rpx(23);
  line-height: 1.7;
  color: var(--text-light);
}
.qr-hint-sub {
  display: block;
  font-size: rpx(21);
  color: var(--text-light);
}
.qr-copy {
  margin-top: rpx(18);
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: rpx(24);
}
.qr-back {
  margin-top: rpx(26);
  width: 100%;
  height: rpx(84);
  border: 1rpx solid var(--border);
  border-radius: var(--radius-md);
  background: #f6f3ee;
  color: var(--text-primary);
  font-size: rpx(28);
  font-weight: 600;
}
.pc-wx-acts {
  margin-top: rpx(28);
  display: flex;
  gap: rpx(20);
}
.pc-wx-acts .am-btn {
  margin-top: 0;
  flex: 1;
}
.pc-wx-copy {
  background: var(--primary-gradient);
  color: #fff;
}
.pc-wx-close {
  background: #f6f3ee;
  color: var(--text-secondary);
}
.am-title {
  font-size: rpx(32);
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  margin-bottom: rpx(24);
}
.am-body {
  font-size: rpx(26);
  line-height: 1.7;
  color: var(--text-secondary);
  white-space: pre-wrap;
}
.am-btn {
  margin-top: rpx(32);
  width: 100%;
  height: rpx(84);
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(30);
}

</style>
