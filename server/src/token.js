// server/src/token.js — 登录态令牌（零依赖 JWT, HS256）
// 背景：guest 直传方案（guestId 即 Bearer）仅适合过渡；手机号/微信登录后需要
//       服务端签发可过期、可校验的令牌，且订单等接口的鉴权要同时兼容：
//         a) 旧客端已存的 guestId / openid 原文（直接查 users 表）
//         b) 新签发的 JWT（verify 后取 payload.uid）
// 密钥：优先 .env AUTH_SECRET；未配则用 H5_DB_PASSWORD 派生（稳定即可，建议配独立密钥）
import crypto from 'node:crypto'
import { hq } from './h5db.js'

const TTL_SEC = 30 * 24 * 3600 // 30 天

function secret() {
  const s = process.env.AUTH_SECRET || (process.env.H5_DB_PASSWORD || 'twl') + ':twl-h5'
  return s
}

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** 签发令牌 payload { uid, iat, exp }（HS256，零依赖实现） */
export function signToken(uid, ttl = TTL_SEC) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ uid: Number(uid), iat: now, exp: now + ttl }))
  const sig = crypto.createHmac('sha256', secret()).update(`${header}.${payload}`).digest('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${header}.${payload}.${sig}`
}

/** 校验令牌 → payload | null */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const expect = crypto.createHmac('sha256', secret()).update(`${h}.${p}`).digest('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  // 恒定时间比较，防时序侧信道
  const a = Buffer.from(expect)
  const b = Buffer.from(s)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64').toString('utf8'))
    const now = Math.floor(Date.now() / 1000)
    if (!payload.uid || !payload.exp || payload.exp < now) return null
    return payload
  } catch (e) {
    return null
  }
}

/**
 * 解析请求 Bearer → users 行（含 id/openid/phone/guest_id），失败返回 null。
 * 依次尝试：① JWT 验签取 uid → 查行；② 原文当 guest_id/openid 查。
 */
export async function resolveUser(req) {
  const auth = String(req.headers.authorization || '')
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token || token.length < 8) return null
  const payload = verifyToken(token)
  if (payload && payload.uid) {
    const rows = await hq(
      'SELECT id, openid, guest_id, phone, username, nickname, avatar FROM users WHERE id = ? LIMIT 1',
      [payload.uid]
    )
    return rows.length ? rows[0] : null
  }
  try {
    const rows = await hq(
      'SELECT id, openid, guest_id, phone, username, nickname, avatar FROM users WHERE guest_id = ? OR openid = ? LIMIT 1',
      [token, token]
    )
    return rows.length ? rows[0] : null
  } catch (e) {
    return null
  }
}
