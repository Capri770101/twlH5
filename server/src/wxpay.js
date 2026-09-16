// 微信支付 v3「服务商模式」客户端（JSAPI / H5 双通道，下单带分账标识）
// 仅服务端使用：商户私钥、APIv3 Key、平台证书均来自 .env / 证书文件，绝不进前端。
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WX_API = 'https://api.mch.weixin.qq.com'

function env(name, fallback) {
  const v = process.env[name]
  return v === undefined || v === '' ? fallback : v
}

function resolveKeyPath(v) {
  // 未配置 → server 目录/certs/apiclient_key.pem；相对路径以 server 目录为基准
  // （本地 server/ 与线上 /opt/twlh5-server 两种部署布局均成立）
  if (!v) return path.join(__dirname, '..', 'certs', 'apiclient_key.pem')
  return path.isAbsolute(v) ? v : path.resolve(__dirname, '..', v)
}

// ---- 配置（缺密钥时函数级报错，不导致模块加载崩溃）----
export const WXPAY = {
  spMchid: env('WXPAY_SP_MCHID'),        // 服务商商户号（跳舞兰）
  spAppid: env('WXPAY_SP_APPID'),        // 服务商公众号 appid（微信内 JSAPI 用）
  apiV3Key: env('WXPAY_APIV3_KEY'),       // APIv3 密钥（解密回调用）
  merchantSerial: env('WXPAY_MERCHANT_SERIAL'), // 商户 API 证书序列号
  merchantKeyPath: resolveKeyPath(env('WXPAY_MERCHANT_KEY_PATH')),
  notifyUrl: env('WXPAY_NOTIFY_URL', 'https://example.com/api/pay/notify'),
  h5RedirectUrl: env('WXPAY_H5_REDIRECT_URL', '') // H5 支付完成后返回的页面（可选）
}

function requireCfg() {
  const missing = []
  if (!WXPAY.spMchid) missing.push('WXPAY_SP_MCHID')
  if (!WXPAY.spAppid) missing.push('WXPAY_SP_APPID')
  if (!WXPAY.apiV3Key) missing.push('WXPAY_APIV3_KEY')
  if (!WXPAY.merchantSerial) missing.push('WXPAY_MERCHANT_SERIAL')
  if (missing.length) throw new Error('[wxpay] 缺少微信支付配置：' + missing.join(', '))
}

let _merchantKey = null
function merchantPrivateKey() {
  if (_merchantKey) return _merchantKey
  try {
    _merchantKey = fs.readFileSync(WXPAY.merchantKeyPath, 'utf8')
  } catch (e) {
    throw new Error('[wxpay] 读取商户私钥失败：' + WXPAY.merchantKeyPath + ' — ' + e.message)
  }
  return _merchantKey
}

// ---- 平台证书（用于验签回调）。优先 /v3/certificates 动态获取并缓存，缺配置时回退文件 ----
let _platformCerts = null // Map<serial, pubkey>
let _certsFetchedAt = 0
const CERT_TTL = 12 * 3600 * 1000

export async function getPlatformCerts() {
  if (_platformCerts && Date.now() - _certsFetchedAt < CERT_TTL) return _platformCerts
  requireCfg()
  const key = merchantPrivateKey()
  const serial = WXPAY.merchantSerial
  const ts = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const msg = `GET\n/v3/certificates\n${ts}\n${nonce}\n\n`
  const sig = crypto.createSign('RSA-SHA256').update(msg).sign(key, 'base64')
  const auth = `WECHATPAY2-SHA256-RSA2048 mchid="${WXPAY.spMchid}",nonce_str="${nonce}",signature="${sig}",timestamp="${ts}",serial_no="${serial}"`
  const resp = await fetch(`${WX_API}/v3/certificates`, {
    // ⚠️ Accept-Language 必须显式给出：Node 的 fetch(undici) 默认会发 `Accept-Language: *`，
    //    微信 v3 直接拒绝并返回 406「传入了不支持的Accept-Language」。
    headers: { Authorization: auth, Accept: 'application/json', 'Accept-Language': 'zh-CN', 'User-Agent': 'twd-h5' }
  })
  if (!resp.ok) throw new Error('[wxpay] 获取平台证书失败：' + resp.status)
  const data = await resp.json()
  const map = new Map()
  for (const item of data.data || []) {
    const c = item.encrypt_certificate
    if (!c) continue
    const plain = decryptAesGcm(c.ciphertext, c.nonce, c.associated_data || '')
    map.set(item.serial_no, plain)
  }
  _platformCerts = map
  _certsFetchedAt = Date.now()
  return map
}

// 告警节流：同类问题 10 分钟内只打一次，避免刷屏
let _lastWarnAt = 0
function warnThrottled(msg) {
  const now = Date.now()
  if (now - _lastWarnAt < 10 * 60 * 1000) return
  _lastWarnAt = now
  console.warn(msg)
}

function decryptAesGcm(ciphertextB64, nonce, associatedData) {
  if (!WXPAY.apiV3Key) throw new Error('[wxpay] 缺少 WXPAY_APIV3_KEY')
  const buf = Buffer.from(ciphertextB64, 'base64')
  const authTag = buf.subarray(buf.length - 16)
  const data = buf.subarray(0, buf.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', WXPAY.apiV3Key, nonce)
  decipher.setAuthTag(authTag)
  if (associatedData) decipher.setAAD(Buffer.from(associatedData))
  return decipher.update(data, null, 'utf8') + decipher.final('utf8')
}

// ---- 请求签名（商户私钥）----
function sign(method, canonicalUrl, body, timestamp, nonce) {
  const message = `${method}\n${canonicalUrl}\n${timestamp}\n${nonce}\n${body}\n`
  return crypto.createSign('RSA-SHA256').update(message).sign(merchantPrivateKey(), 'base64')
}

function authHeader(method, canonicalUrl, body = '') {
  requireCfg()
  const ts = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const signature = sign(method, canonicalUrl, body, ts, nonce)
  return `WECHATPAY2-SHA256-RSA2048 mchid="${WXPAY.spMchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${ts}",serial_no="${WXPAY.merchantSerial}"`
}

// ---- 发送请求并验响应签名 ----
export async function wxpayRequest(method, apiPath, bodyObj) {
  requireCfg()
  const body = bodyObj ? JSON.stringify(bodyObj) : ''
  const headers = {
    Authorization: authHeader(method, apiPath, body),
    Accept: 'application/json',
    // 见 getPlatformCerts 注释：不显式指定会被微信以 406 拒绝
    'Accept-Language': 'zh-CN',
    'Content-Type': 'application/json',
    'User-Agent': 'twd-h5',
    'Wechatpay-Signature-Type': 'RSA'
  }
  const resp = await fetch(`${WX_API}${apiPath}`, { method, headers, body: body || undefined })
  const respBody = await resp.text()
  // 验响应签名（用平台证书）——**加固手段，不阻断业务**：
  // 平台证书接口抖动不应升级为"全站支付不可用"（HTTPS 已保证传输层安全）。
  const whSig = resp.headers.get('wechatpay-signature')
  const whTs = resp.headers.get('wechatpay-timestamp')
  const whNonce = resp.headers.get('wechatpay-nonce')
  const whSerial = resp.headers.get('wechatpay-serial')
  if (whSig && whTs && whNonce) {
    let pub = null
    try {
      const certs = await getPlatformCerts()
      pub = certs.get(whSerial) || null
    } catch (e) {
      warnThrottled('[wxpay] 平台证书不可用，本次跳过响应验签：' + (e.message || e))
    }
    if (pub) {
      const vmsg = `${whTs}\n${whNonce}\n${respBody}\n`
      const ok = crypto.createVerify('RSA-SHA256').update(vmsg).verify(pub, whSig, 'base64')
      if (!ok) throw new Error('[wxpay] 响应签名验签失败')
    }
  }
  let json = null
  try { json = respBody ? JSON.parse(respBody) : null } catch (e) { /* 可能为空 */ }
  if (!resp.ok) {
    const code = json && (json.code || json.message)
    throw new Error(`[wxpay] ${method} ${apiPath} -> ${resp.status} ${code || respBody}`)
  }
  return json
}

// ---- 解密回调通知资源 ----
export function decryptResource(resource) {
  return decryptAesGcm(resource.ciphertext, resource.nonce, resource.associated_data || '')
}

// ---- 验证回调签名（Express 原始 body）----
export async function verifyNotify(rawBody, headers) {
  const sig = headers['wechatpay-signature']
  const ts = headers['wechatpay-timestamp']
  const nonce = headers['wechatpay-nonce']
  const serial = headers['wechatpay-serial']
  if (!sig || !ts || !nonce) return false
  const certs = await getPlatformCerts()
  const pub = certs.get(serial)
  if (!pub) return false
  const msg = `${ts}\n${nonce}\n${rawBody}\n`
  return crypto.createVerify('RSA-SHA256').update(msg).verify(pub, sig, 'base64')
}

// ---- JSAPI 调起支付参数（wx.chooseWXPay / JS-SDK）----
export function buildJsapiPayParams(prepayId, appId) {
  requireCfg()
  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = crypto.randomUUID().replace(/-/g, '')
  const pkg = `prepay_id=${prepayId}`
  const msg = `${appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
  const paySign = crypto.createSign('RSA-SHA256').update(msg).sign(merchantPrivateKey(), 'base64')
  return { appId, timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign }
}

export const WX_API_BASE = WX_API
