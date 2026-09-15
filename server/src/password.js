// server/src/password.js — 账号密码哈希（零依赖，Node crypto scrypt）
// 存储格式：scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>
//   N=16384, r=8, p=1（约 16MB 内存 / 单次 ~100ms，抗暴力）
// 校验用 timingSafeEqual 防时序侧信道；参数随哈希存储，便于日后调参不破坏旧密码。
import crypto from 'node:crypto'

const DEF_N = 16384
const DEF_R = 8
const DEF_P = 1
const KEYLEN = 32

/** 生成密码哈希（存储串） */
export function hashPassword(plain) {
  const pwd = String(plain || '')
  if (!pwd) throw { status: 400, message: '密码不能为空' }
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(pwd, salt, KEYLEN, { N: DEF_N, r: DEF_R, p: DEF_P })
  return `scrypt$${DEF_N}$${DEF_R}$${DEF_P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

/** 校验明文密码是否匹配存储串 */
export function verifyPassword(plain, stored) {
  const pwd = String(plain || '')
  const s = String(stored || '')
  if (!pwd || !s) return false
  const parts = s.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const n = Number(parts[1]); const r = Number(parts[2]); const p = Number(parts[3])
  if (!n || !r || !p) return false
  let salt; let expected
  try {
    salt = Buffer.from(parts[4], 'base64')
    expected = Buffer.from(parts[5], 'base64')
  } catch (e) { return false }
  if (!expected.length) return false
  let actual
  try {
    actual = crypto.scryptSync(pwd, salt, expected.length, { N: n, r, p })
  } catch (e) { return false }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

/** 账号格式：字母开头，4-20 位字母/数字/下划线 */
export const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,19}$/

export function validUsername(u) {
  return USERNAME_RE.test(String(u || ''))
}

/** 密码长度：6-32 位 */
export function validPassword(p) {
  const s = String(p || '')
  return s.length >= 6 && s.length <= 32
}
