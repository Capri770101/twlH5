// server/src/sms.js — 短信验证码（h5_shop.sms_codes）
// 模式（.env）：
//   DEBUG_SMS=1 或未配齐任何通道凭证 → debug 模式：不真发短信，生成码落库并回显给前端（联调用）
//   通道由 SMS_PROVIDER 选择（aliyun | tencent）；留空则自动用「已配齐」的那个
//     · aliyun  → 阿里云短信 dysmsapi（RPC 风格 V1 签名 HMAC-SHA1）
//     · tencent → 腾讯云 SMS（TC3-HMAC-SHA256）
//   两个通道都是零第三方依赖（只用 node:crypto + fetch），可随时互换。
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

/** 各通道「必须配齐」的变量清单（只看有值，不校验有效性） */
const ALIYUN_KEYS = ['SMS_ALIYUN_ACCESS_KEY_ID', 'SMS_ALIYUN_ACCESS_KEY_SECRET', 'SMS_ALIYUN_SIGN_NAME', 'SMS_ALIYUN_TEMPLATE_CODE']
const TENCENT_KEYS = ['SMS_TC3_SECRET_ID', 'SMS_TC3_SECRET_KEY', 'SMS_SDK_APP_ID', 'SMS_SIGN_NAME', 'SMS_TEMPLATE_ID']

/**
 * 解析当前生效的通道。返回 { provider, ready, want, missing, candidates }
 * provider: 'aliyun' | 'tencent' | null（null = 没配齐，只能 debug）
 * missing : 还差哪几个环境变量（供运维一眼定位，不要只报「未配置」）
 */
export function smsStatus() {
  const want = String(process.env.SMS_PROVIDER || '').trim().toLowerCase()
  const missA = ALIYUN_KEYS.filter((k) => !process.env[k])
  const missT = TENCENT_KEYS.filter((k) => !process.env[k])
  const aOk = missA.length === 0
  const tOk = missT.length === 0

  let provider = null
  if (want === 'aliyun') provider = aOk ? 'aliyun' : null
  else if (want === 'tencent') provider = tOk ? 'tencent' : null
  else provider = aOk ? 'aliyun' : (tOk ? 'tencent' : null) // 未指定 → 自动挑已配齐的

  // 没配齐时报「目标通道」缺的变量：显式指定的优先，否则给默认可用的阿里云
  const missing = provider ? [] : (want === 'tencent' ? missT : missA)
  return {
    provider, ready: !!provider, want: want || 'auto', missing,
    candidates: {
      aliyun: { ready: aOk, missing: missA },
      tencent: { ready: tOk, missing: missT }
    }
  }
}

export function isDebugMode() {
  // ⚠️ 生产环境默认关闭 debug：debug 含「免库万能码 123456 + 回显验证码」，
  //    会让任意手机号绕过短信校验登录/注册 → 账号体系失守。仅显式 ALLOW_DEBUG_SMS=1 才放行。
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEBUG_SMS !== '1') return false
  if (process.env.DEBUG_SMS === '1') return true
  // 未配齐短信通道凭证 → 视为 debug（避免误以为已接真实短信商）
  return !smsStatus().ready
}

export function smsMode() {
  const st = smsStatus()
  const debug = isDebugMode()
  return { mode: debug ? 'debug' : st.provider, provider: st.provider, ready: st.ready, missing: st.missing, debug }
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
  const st = smsStatus()
  if (!st.ready) {
    // 生产环境未配短信通道 → 明确告知原因，不要抛含糊的 502
    throw { status: 503, message: `短信通道未配置（缺少 ${st.missing.join(' / ')}），请联系管理员` }
  }
  if (st.provider === 'aliyun') await sendAliyunSms(phone, code)
  else await sendTencentSms(phone, code)
  return { ok: true, debug: false, provider: st.provider }
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

// ---------- 阿里云短信 SMS（dysmsapi，RPC 风格 V1 签名 HMAC-SHA1，零依赖） ----------
// 需要的 .env：
//   SMS_ALIYUN_ACCESS_KEY_ID / SMS_ALIYUN_ACCESS_KEY_SECRET  （建议用 RAM 子账号，只授 dysms 权限）
//   SMS_ALIYUN_SIGN_NAME      签名名称（控制台「签名管理」里已审核通过的那个）
//   SMS_ALIYUN_TEMPLATE_CODE  模板 CODE，形如 SMS_2958xxxx（控制台「模板管理」）
//   SMS_ALIYUN_TEMPLATE_PARAM 变量名映射模板，默认 {"code":"{code}"}（单变量验证码模板）
//                             {code}=验证码、{ttl}=有效分钟数；
//                             ⚠️ **变量个数与键名必须与模板正文里的 ${xxx} 完全一致**，
//                             多了少了都会被阿里云判参数错误（模板把「N分钟内有效」写死时
//                             就只有一个 ${code}，不要带 min 键）。
//                             例：正文「您的验证码是${code}，${min}分钟内有效」→ {"code":"{code}","min":"{ttl}"}
//   SMS_ALIYUN_REGION         可选，默认 cn-hangzhou

/** 阿里云 POP 签名要求的 percentEncode：保留 A-Za-z0-9-_.~，其余全编码（空格→%20 而非 +） */
function pe(v) {
  return encodeURIComponent(String(v))
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%7E/g, '~')
}

async function sendAliyunSms(phone, code) {
  const params = {
    AccessKeyId: process.env.SMS_ALIYUN_ACCESS_KEY_ID,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: String(phone),
    RegionId: process.env.SMS_ALIYUN_REGION || 'cn-hangzhou',
    SignName: process.env.SMS_ALIYUN_SIGN_NAME,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    TemplateCode: process.env.SMS_ALIYUN_TEMPLATE_CODE,
    TemplateParam: String(process.env.SMS_ALIYUN_TEMPLATE_PARAM || '{"code":"{code}"}')
      .replace(/\{code\}/g, String(code))
      .replace(/\{ttl\}/g, String(TTL_MIN)),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25'
  }
  // 待签名串：参数按 key 字典序 → key=value 编码后 & 连接
  const canonical = Object.keys(params).sort()
    .map((k) => `${pe(k)}=${pe(params[k])}`).join('&')
  const stringToSign = `POST&${pe('/')}&${pe(canonical)}`
  const signature = crypto.createHmac('sha1', process.env.SMS_ALIYUN_ACCESS_KEY_SECRET + '&')
    .update(stringToSign).digest('base64')

  const res = await fetch('https://dysmsapi.aliyuncs.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `${canonical}&Signature=${pe(signature)}`
  })
  const j = await res.json().catch(() => null)
  if (!res.ok || !j || j.Code !== 'OK') {
    // ⚠️ 只打 Message 是不够的：阿里云大量问题的定位信息在 Code 里（SignatureDoesNotMatch / Forbidden.RAM /
    //    isv.TEMPLATE_PARAM_ERROR…），所以 code + message + requestId 一起打，并翻译成人话。
    const code = (j && j.Code) || ('HTTP_' + res.status)
    const msg = (j && j.Message) || '(无 message)'
    const rid = (j && j.RequestId) || '-'
    console.warn('[sms/aliyun] 发送失败 code=%s requestId=%s message=%s', code, rid, msg)
    const hint = aliyunHint(code + ' ' + msg)
    throw { status: 502, message: `短信发送失败：${code} | ${msg}${hint ? ' → ' + hint : ''}` }
  }
}

/** 阿里云错误 → 人话（上线后一眼定位，不用查文档） */
const ALIYUN_HINTS = [
  [/not authorized|Forbidden|NoPermission|ImplicitDeny/i, 'RAM 权限不足：RAM 控制台需给该用户授权 AliyunDysmsFullAccess'],
  [/SignatureDoesNotMatch/i, '签名不匹配：AccessKey Secret 填错，或服务器时间偏差过大'],
  [/InvalidAccessKeyId/i, 'AccessKey ID 不存在或已被禁用'],
  [/SMS_SIGNATURE_ILLEGAL/i, '签名不合法：未审核通过或与账号不匹配（查 SMS_ALIYUN_SIGN_NAME）'],
  [/SMS_TEMPLATE_ILLEGAL/i, '模板不合法：未审核通过或 CODE 不对（查 SMS_ALIYUN_TEMPLATE_CODE）'],
  [/TEMPLATE_PARAM|PARAM_LENGTH|variable/i, '模板变量不匹配：SMS_ALIYUN_TEMPLATE_PARAM 的键名与个数须与模板正文 ${xxx} 一致'],
  [/PORT_NOT_REGISTERED/i, '签名实名报备未完成（运营商侧）：继续测试发送等报备落定，非代码问题'],
  [/AMOUNT_NOT_ENOUGH/i, '阿里云账户余额不足'],
  [/BUSINESS_LIMIT_CONTROL|DAY_LIMIT/i, '触发阿里云流控或日发送量上限'],
  [/MOBILE_NUMBER_ILLEGAL/i, '手机号格式不合法'],
  [/MOBILE_NUMBER_NOT_REGISTERED/i, '该号码为空号/停机'],
  [/UNSUPPORTED_OPERATION|SERVICE_NOT_ENABLED/i, '短信服务未开通或该账户不可用短信']
]
function aliyunHint(text) {
  for (const [re, hint] of ALIYUN_HINTS) if (re.test(text)) return hint
  return ''
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
