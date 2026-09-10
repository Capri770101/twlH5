<template>
  <div class="page">
    <NavBar title="登录 · 注册" />

    <div class="brand">
      <div class="brand-logo">🌸</div>
      <div class="brand-name">跳舞兰AI花店</div>
      <div class="brand-sub">用一束花，表达每一份心意</div>
    </div>

    <div class="form">
      <div class="field">
        <span class="field-icon">📱</span>
        <input class="field-input" type="tel" inputmode="numeric" maxlength="11"
               v-model="phone" placeholder="请输入手机号" />
      </div>

      <div class="field">
        <span class="field-icon">🔑</span>
        <input class="field-input" type="tel" inputmode="numeric" maxlength="6"
               v-model="code" placeholder="请输入验证码" />
        <button class="code-btn" :class="{ disabled: sending }" :disabled="sending" @click="onSendCode">
          {{ sending ? countdown + 's 后重发' : '获取验证码' }}
        </button>
      </div>

      <button class="login-btn" :class="{ disabled: !canPhoneLogin }" @click="onPhoneLogin">
        手机号验证码登录
      </button>

      <div class="divider"><span>或</span></div>

      <button class="login-btn wechat" :class="{ disabled: !agreed }" @click="onWechatLogin">
        <span class="wb-icon">💬</span> 微信一键登录
      </button>
      <p class="env-tip" v-if="wechatEnv">检测到微信环境，将使用微信授权登录</p>
    </div>

    <div class="agreement" @click="agreed = !agreed">
      <span class="checkbox" :class="{ checked: agreed }">{{ agreed ? '✓' : '' }}</span>
      <span class="agree-text">我已阅读并同意</span>
      <span class="agree-link" @click.stop="openAgreement('service')">《用户服务协议》</span>
      <span class="agree-text">和</span>
      <span class="agree-link" @click.stop="openAgreement('privacy')">《隐私政策》</span>
    </div>

    <div v-if="toastText" class="twd-toast">{{ toastText }}</div>

    <div v-if="showAgreement" class="modal-mask" @click="showAgreement = false">
      <div class="modal-content agreement-modal" @click.stop>
        <div class="am-title">{{ agreementTitle }}</div>
        <div class="am-body">{{ agreementText }}</div>
        <button class="am-btn" @click="showAgreement = false">我已知晓</button>
      </div>
    </div>

    <!-- PC 端 / 外部浏览器点微信登录：方案 B 扫码中转（禁静默授权，绝不 mock 建账号） -->
    <div v-if="showPcQr" class="modal-mask" @click="closePcQr">
      <div class="modal-content pc-wx-modal" @click.stop>
        <div class="am-title">微信扫码登录</div>
        <div class="am-body pc-wx-tip-body">
          打开手机微信「扫一扫」，扫描下方二维码，
          <br />在手机上完成授权后，电脑将自动登录。
        </div>
        <div class="pc-qr-wrap">
          <img v-if="pcQrData" :src="pcQrData" class="pc-qr-img" alt="微信登录二维码" />
          <div v-if="pcQrExpired" class="pc-qr-expired">
            <div>二维码已过期</div>
            <button class="pc-qr-refresh" @click="openPcQr">刷新二维码</button>
          </div>
        </div>
        <div class="pc-qr-hint">请使用手机微信扫一扫</div>
        <div class="pc-wx-acts">
          <button class="am-btn pc-wx-copy" @click="onCopyLink">链接在手机打开</button>
          <button class="am-btn pc-wx-close" @click="closePcQr">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'
import NavBar from '@/components/NavBar.vue'
import store, { login } from '@/store'
import {
  loginByWechat, loginByWechatPc, loginByPhone, sendSmsCode,
  isWechatEnv, buildWechatAuthUrl, buildWechatPcAuthUrl, fetchAuthConfig,
  pcApprove, pcStatus, genPcTicket, WX_APPID
} from '@/mock/api'

const route = useRoute()
const router = useRouter()

const agreed = ref(false)
const phone = ref('')
const code = ref('')
const sending = ref(false)
const countdown = ref(60)
const wechatEnv = isWechatEnv()
let timer = null

const toastText = ref('')
let toastTimer = null
function toast(text) {
  toastText.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}

const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(phone.value))
const canPhoneLogin = computed(() => phoneValid.value && /^\d{6}$/.test(code.value))

function onSendCode() {
  if (sending.value) return
  if (!phoneValid.value) { toast('请输入正确的手机号'); return }
  sending.value = true
  countdown.value = 60
  sendSmsCode(phone.value).then(r => {
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
  try {
    const { userInfo, token } = await loginByPhone(phone.value, code.value)
    finishLogin(userInfo, token)
  } catch (e) {
    toast(e.message || '登录失败')
  }
}

async function onWechatLogin() {
  if (!agreed.value) { toast('请先阅读并同意协议'); return }
  // 微信内 + 已配置 appId → 跳公众号网页授权 snsapi_userinfo，回跳后由后端 code2session 换取 token
  if (wechatEnv && WX_APPID) {
    const authUrl = buildWechatAuthUrl(location.href)
    if (authUrl) { location.href = authUrl; return }
  }
  // ⚠️ 硬策略（2026-09-10）：任何场景禁用静默授权（包括 PC 端 / 外部浏览器 / AppID 缺失）。
  // PC / 外部浏览器 → 优先开放平台「网站应用」扫码（后端配好 WX_OPEN_APPID 后自动启用）；
  // 未配置 → 方案 B 扫码中转：PC 出二维码，手机微信扫码走 snsapi_userinfo 授权回传（有同意框）。
  //   两条路都是用户主动授权，绝不 mock 自动建账号。
  if (!wechatEnv) {
    const cfg = await fetchAuthConfig()
    if (cfg && cfg.pcWechatReady && cfg.wxOpenAppid) {
      const pcAuthUrl = buildWechatPcAuthUrl(location.href, cfg.wxOpenAppid)
      if (pcAuthUrl) { location.href = pcAuthUrl; return }
    }
    openPcQr() // 方案 B：H5 扫码中转
    return
  }
  toast('微信授权未配置，请联系运营')
}

function finishLogin(userInfo, token) {
  login(userInfo, token)
  toast('登录成功')
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

// ===== PC 端微信登录·方案 B：扫码中转（无需微信开放平台审核，即刻可用） =====
// PC 生成随机票据 → 二维码内容 = /login?pc=<ticket> → 手机微信扫码 → 公众号 snsapi_userinfo
// 授权登录 → POST /auth/pc-approve 绑定 → PC 每 2s 轮询 /auth/pc-status → 拿同账号 token 登录。
const showPcQr = ref(false)
const pcQrData = ref('')
const pcQrExpired = ref(false)
const pcUrl = ref('')
let pcPollTimer = null

function stopPcPoll() {
  if (pcPollTimer) { clearInterval(pcPollTimer); pcPollTimer = null }
}

function closePcQr() {
  showPcQr.value = false
  stopPcPoll()
}

async function openPcQr() {
  const ticket = genPcTicket()
  pcQrExpired.value = false
  pcUrl.value = location.origin + '/login?pc=' + ticket
  try {
    pcQrData.value = await QRCode.toDataURL(pcUrl.value, { width: 320, margin: 1 })
  } catch (e) {
    toast('二维码生成失败，请重试')
    return
  }
  showPcQr.value = true
  stopPcPoll()
  const startAt = Date.now()
  pcPollTimer = setInterval(async () => {
    if (!showPcQr.value) { stopPcPoll(); return }
    if (Date.now() - startAt > 5 * 60 * 1000) { // 票据 TTL 5 分钟，过期出刷新
      stopPcPoll(); pcQrExpired.value = true; return
    }
    try {
      const d = await pcStatus(ticket)
      if (d && d.status === 'approved' && d.token) {
        stopPcPoll()
        showPcQr.value = false
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

// ===== 手机端：扫 PC 二维码打开（?pc=票据）→ 授权登录后回传 =====
let phonePcTicket = ''

async function approvePhonePc() {
  const t = phonePcTicket
  if (!t) return
  phonePcTicket = ''
  try {
    await pcApprove(t)
    toast('已授权电脑登录，可关闭本页')
  } catch (e) {
    toast(e.message || '电脑端授权失败')
  }
}

// 微信授权回跳：微信内 ?code=xxx&state=twd → loginByWechat；PC 扫码 ?code=xxx&state=twdpc → loginByWechatPc
// pcTicket：手机扫 PC 码后 OAuth 回跳带的票据，登录成功后回传授权而不是跳个人页
async function wechatLoginByCode(code, state, pcTicket) {
  try {
    const clean = location.href.split('?')[0] + (location.search.replace(/[?&](code|state|pc)=[^&]*/g, '').replace(/^&/, '?'))
    history.replaceState(null, '', clean)
    const { userInfo, token } = state === 'twdpc'
      ? await loginByWechatPc({ code })   // PC 开放平台扫码（unionid 跨端归一）
      : await loginByWechat({ code })     // 微信内公众号网页授权
    if (pcTicket) {
      // 手机扫 PC 码场景：登录后把票据授权给电脑，停留本页提示可关闭
      login(userInfo, token)
      await approvePhonePc()
    } else {
      finishLogin(userInfo, token)
    }
  } catch (e) {
    toast(e.message || '微信登录失败，请重试')
  }
}

onMounted(() => {
  const q = route.query
  if (q.code && (q.state === 'twd' || q.state === 'twdpc')) {
    const pc = (q.pc && /^[a-f0-9]{16,64}$/i.test(String(q.pc))) ? String(q.pc) : ''
    wechatLoginByCode(String(q.code), String(q.state), pc)
    return
  }
  // 扫 PC 二维码打开：已登录直接授权；未登录走微信授权（snsapi_userinfo 有同意框，不静默）
  const pc = (q.pc && /^[a-f0-9]{16,64}$/i.test(String(q.pc))) ? String(q.pc) : ''
  if (pc) {
    phonePcTicket = pc
    if (store.isLogged && store.token && !String(store.token).startsWith('mock_')) {
      approvePhonePc()
      return
    }
    if (wechatEnv && WX_APPID) {
      const authUrl = buildWechatAuthUrl(location.href) // redirect_uri 保留 ?pc= 票据
      if (authUrl) { location.href = authUrl; return }
    }
    toast('请在手机微信中扫码打开')
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  clearTimeout(toastTimer)
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
  margin-top: rpx(120);
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
  margin-top: rpx(80);
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

/* PC 端微信扫码登录弹窗（方案 B） */
.pc-wx-modal {
  width: rpx(640);
}
.pc-wx-tip-body {
  text-align: center;
  font-size: rpx(26);
  line-height: 1.8;
  color: var(--text-secondary);
}
.pc-qr-wrap {
  position: relative;
  margin: rpx(28) auto 0;
  width: rpx(360);
  height: rpx(360);
  background: #fff;
  border: 1rpx solid var(--border-light);
  border-radius: rpx(16);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.pc-qr-img {
  width: 100%;
  height: 100%;
  display: block;
}
.pc-qr-expired {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.96);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: rpx(20);
  font-size: rpx(26);
  color: var(--text-secondary);
}
.pc-qr-refresh {
  border: none;
  border-radius: 999rpx;
  background: var(--primary-gradient);
  color: #fff;
  font-size: rpx(26);
  padding: rpx(14) rpx(40);
}
.pc-qr-hint {
  margin-top: rpx(16);
  text-align: center;
  font-size: rpx(22);
  color: var(--text-light);
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
