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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import { login } from '@/store'
import {
  loginByWechat, loginByPhone, sendSmsCode,
  isWechatEnv, buildWechatAuthUrl, WX_APPID
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

function onWechatLogin() {
  if (!agreed.value) { toast('请先阅读并同意协议'); return }
  // 真实接入：微信内 + 已配置 appId → 跳转微信网页授权，回跳后由后端 code2session 换取 token
  if (wechatEnv && WX_APPID) {
    const authUrl = buildWechatAuthUrl(location.href)
    if (authUrl) { location.href = authUrl; return }
  }
  // mock 阶段：直接模拟微信登录成功
  toast('微信登录中…')
  loginByWechat().then(({ userInfo, token }) => finishLogin(userInfo, token))
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

// 微信网页授权回跳：?code=xxx&state=twd → 自动用 code 登录（后端 code2session 换 openid）
async function wechatLoginByCode(code) {
  try {
    const clean = location.href.split('?')[0] + (location.search.replace(/[?&](code|state)=[^&]*/g, '').replace(/^&/, '?'))
    history.replaceState(null, '', clean)
    const { userInfo, token } = await loginByWechat({ code })
    finishLogin(userInfo, token)
  } catch (e) {
    toast(e.message || '微信登录失败，请重试')
  }
}

onMounted(() => {
  const q = route.query
  if (q.code && q.state === 'twd') wechatLoginByCode(String(q.code))
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  clearTimeout(toastTimer)
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
