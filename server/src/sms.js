// server/src/sms.js — 短信验证码（h5_shop.sms_codes）
// 模式（.env）：
//   DEBUG_SMS=1 或未配腾讯云密钥 → debug 模式：不真发短信，生成码落库并回显给前端（联调用）
//   配齐 SMS_TC3_* → tencent 模式：腾讯云 SMS 真发（TC3-HMAC-SHA256 直调，零依赖）
// 安全约束：60s 重发间隔；5 分钟有效；单号最多错 5 次后作废；debug 模式固定万能码 123456 可过
import crypto from 'node:crypto'
import { hq } from './h5db.js'

const SCENE = 'login'
const TTL_MIN = 5
const RESEND_SEC = 60
const MAX_FAIL = 5

/** 幂等建表（服务启动时调用一次即可；重复执行无副作用） */
export async function ensureSmsTable() {
  await hq(`CREATE TABLE IF NOT EXISTS sms_codes (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    phone       VARCHAR(20)     NOT NULL,
    scene       VARCHAR(16)     NOT NULL DEFAULT 'login',
    code        VARCHAR(8)      NOT NULL,
    expires_at  DATETIME        NOT NULL,
    used        TINYINT(1)      NOT NULL DEFAULT 0,
    fail_count  TINYINT         NOT NULL DEFAULT 0,
    create_time DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_lookup (phone, scene, used, expires_at)
  ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '短信验证码（debug 先行）'`)
}

export function isDebugMode() {
  // ⚠️ 生产环境默认关闭 debug：debug 含「免库万能码 123456 + 回显验证码」，
  //    会让任意手机号绕过短信校验登录/注册 → 账号体系失守。仅显式 ALLOW_DEBUG_SMS=1 才放行。
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEBUG_SMS !== '1') return false
  if (process.env.DEBUG_SMS === '1') return true
  // 未配齐腾讯云短信密钥 → 视为 debug（避免误以为已接真实短信商）
  return !(process.env.SMS_TC3_SECRET_ID && process.env.SMS_TC3_SECRET_KEY &&
    process.env.SMS_SDK_APP_ID && process.env.SMS_SIGN_NAME && process.env.SMS_TEMPLATE_ID)
}

export function smsMode() {
  return { mode: isDebugMode() ? 'debug' : 'tencent', debug: isDebugMode() }
}

const PHONE_RE = /^1[3-9]\d{9}$/
export function validPhone(p) {
  return PHONE_RE.test(String(p || ''))
}

function genCode() {
  return String(Math.floor(Math.random() * 900000) + 100000)
}

/** 取该手机号最新一条「未用且未过期」记录 */
async function latestActive(phone) {
  const rows = await hq(
    `SELECT * FROM sms_codes WHERE phone = ? AND scene = ? AND used = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [phone, SCENE]
  )
  return rows.length ? rows[0] : null
}

/**
 * 发送验证码。成功返回 { ok:true, debug?:true, code?:'123456'（仅 debug 回显） }
 * 60s 内重复 → throw { status:429, message:'发送太频繁，请稍后再试' }
 */
export async function sendCode(phone) {
  if (!validPhone(phone)) throw { status: 400, message: '手机号格式不正确' }
  const recent = await hq(
    `SELECT id FROM sms_codes WHERE phone = ? AND scene = ? AND create_time > NOW() - INTERVAL ? SECOND LIMIT 1`,
    [phone, SCENE, RESEND_SEC]
  )
  if (recent.length) throw { status: 429, message: `发送太频繁，请 ${RESEND_SEC}s 后再试` }

  const code = genCode()
  await hq(
    `INSERT INTO sms_codes (phone, scene, code, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [phone, SCENE, code, TTL_MIN]
  )

  const debug = isDebugMode()
  if (debug) {
    // debug：不真发短信，把码回给调用方（前端 toast 提示即可）
    return { ok: true, debug: true, code }
  }
  await sendTencentSms(phone, code)
  return { ok: true, debug: false }
}

/**
 * 校验验证码并消费（原子：成功置 used=1，失败 fail_count+1，≥5 次作废）
 * 返回 { ok:true } | throw { status:400, message }
 */
export async function consumeCode(phone, inputCode) {
  if (!validPhone(phone)) throw { status: 400, message: '手机号格式不正确' }
  const code = String(inputCode || '').trim()
  if (!/^\d{6}$/.test(code)) throw { status: 400, message: '验证码为 6 位数字' }
  const debug = isDebugMode()
  // debug 万能码：任意时刻可用（不依赖短信记录），仅联调/测试期存在
  if (debug && code === '123456') return { ok: true }
  const row = await latestActive(phone)
  const ok = row && row.code === code
  if (!ok) {
    if (row) {
      const fails = Number(row.fail_count || 0) + 1
      // 连续错满 MAX_FAIL：作废该码（防爆破）
      await hq('UPDATE sms_codes SET fail_count = ?, used = IF(? >= ?, 1, used) WHERE id = ?',
        [fails, fails, MAX_FAIL, row.id])
      if (fails >= MAX_FAIL) throw { status: 400, message: '错误次数过多，请重新获取验证码' }
    }
    throw { status: 400, message: '验证码错误' }
  }
  await hq('UPDATE sms_codes SET used = 1 WHERE id = ?', [row.id])
  return { ok: true }
}

// ---------- 腾讯云 SMS（TC3-HMAC-SHA256 直调，零依赖） ----------
async function sendTencentSms(phone, code) {
  const secretId = process.env.SMS_TC3_SECRET_ID
  const secretKey = process.env.SMS_TC3_SECRET_KEY
  const payload = {
    PhoneNumberSet: [phone],
    SmsSdkAppId: process.env.SMS_SDK_APP_ID,
    SignName: process.env.SMS_SIGN_NAME,
    TemplateId: process.env.SMS_TEMPLATE_ID,
    TemplateParamSet: [code, String(TTL_MIN)]
  }
  const { body, authorization, timestamp, date } = tc3Sign(secretId, secretKey, payload)
  const res = await fetch('https://sms.tencentcloudapi.com', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: 'sms.tencentcloudapi.com',
      'X-TC-Action': 'SendSms',
      'X-TC-Version': '2021-01-11',
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': process.env.SMS_TC3_REGION || 'ap-guangzhou'
    },
    body
  })
  const j = await res.json().catch(() => null)
  const status = j && j.Response && j.Response.SendStatusSet && j.Response.SendStatusSet[0]
  const err = j && j.Response && j.Response.Error
  if (!res.ok || err || !status || status.Code !== 'Ok') {
    const msg = (err && err.Message) || (status && status.Message) || ('tencent sms http ' + res.status)
    throw { status: 502, message: '短信发送失败：' + msg }
  }
}

function tc3Sign(secretId, secretKey, payload) {
  const service = 'sms'
  const host = 'sms.tencentcloudapi.com'
  const contentType = 'application/json; charset=utf-8'
  const body = JSON.stringify(payload)
  const now = new Date()
  const timestamp = Math.floor(now.getTime() / 1000)
  // 2019-02-25T12:00:00Z 形式
  const iso = now.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const date = iso.slice(0, 10)
  const hashedPayload = crypto.createHash('sha256').update(body).digest('hex')
  const canonicalRequest = [
    'POST', '/', '',
    `content-type:${contentType}\nhost:${host}\n`,
    'content-type;host',
    hashedPayload
  ].join('\n')
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonical = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, hashedCanonical].join('\n')
  const kDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest()
  const kService = crypto.createHmac('sha256', kDate).update(service).digest()
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')
  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`
  return { body, authorization, timestamp, date }
}
