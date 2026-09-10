// H5 用户身份与统一账号（h5_shop.users）
// 目标：无论从哪个入口登录（匿名访客 / 手机号验证码 / 微信网页授权），同一人始终落到同一行用户。
// 归一规则（见 pickMain）：主身份 = 「已绑定手机号」的行优先（手机号可找回、可跨端），
//   其余候选行（guest 行 / 微信 openid 行）通过 mergeRow 并入主行：
//     订单/地址 user_id 迁移、openid/phone 唯一键转移、资料空缺补全、孤儿行删除。
// 鉴权：所有入口统一签发 JWT（server/src/token.js，HS256 零依赖），兼容旧客端 guest_id 原文。
import express from 'express'
import { hq, withTx } from './h5db.js'
import { signToken, verifyToken } from './token.js'
import { ensureSmsTable, sendCode, consumeCode, smsMode, validPhone } from './sms.js'

const router = express.Router()

// 启动即幂等建短信码表。应用账号(h5_app)无 DDL 权限属预期（表由 root 预建），
// 仅权限类错误静默降噪，其他失败仍告警。
ensureSmsTable().catch(e => {
  const c = Number((e && (e.code || e.errno)) || 0)
  if (![1044, 1045, 1142].includes(c)) console.warn('[auth] sms_codes 建表失败：', e && e.message)
})

// ---------- 展示层用户形状 ----------
function publicUser(u) {
  return {
    id: String(u.id),
    nickname: u.nickname || (u.phone ? '花友' + String(u.phone).slice(-4) : '微信用户'),
    avatar: u.avatar || '',
    phone: u.phone || '',
    openid: u.openid || '',
    unionid: u.unionid || '',
    guest: !u.phone && !u.openid && !u.unionid
  }
}

// ---------- 账号归一（事务内 helper） ----------
/** 把 fromId 行整体并入 mainId 行（订单迁移 → 唯一键转移 → 补资料 → 删孤儿行） */
async function mergeRow(conn, fromId, mainId) {
  if (!fromId || !mainId || fromId === mainId) return
  const [[from]] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [fromId])
  if (!from) return
  const [[main]] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [mainId])
  if (!main) return
  await conn.query('UPDATE orders SET user_id = ? WHERE user_id = ?', [mainId, fromId])
  await conn.query('UPDATE addresses SET user_id = ? WHERE user_id = ?', [mainId, fromId])
  if (from.openid && !main.openid) {
    await conn.query('UPDATE users SET openid = NULL WHERE id = ?', [fromId]) // 先释放唯一键
    await conn.query('UPDATE users SET openid = ? WHERE id = ?', [from.openid, mainId])
  }
  if (from.phone && !main.phone) {
    await conn.query('UPDATE users SET phone = NULL WHERE id = ?', [fromId])
    await conn.query('UPDATE users SET phone = ? WHERE id = ?', [from.phone, mainId])
  }
  if ((from.nickname && !main.nickname) || (from.avatar && !main.avatar)) {
    await conn.query(
      'UPDATE users SET nickname = COALESCE(NULLIF(?, ""), nickname), avatar = COALESCE(NULLIF(?, ""), avatar) WHERE id = ?',
      [from.nickname || '', from.avatar || '', mainId]
    )
  }
  await conn.query('DELETE FROM users WHERE id = ?', [fromId]) // 无外键引用，安全清理
}

/** 主身份选择：有 phone 的行优先（手机号为主身份），否则取第一个候选；其余候选全部并入主行 */
async function pickMain(conn, cands) {
  const list = (cands || []).filter(Boolean)
  const main = list.find(c => c.phone) || list[0] || null
  if (!main) return null
  for (const c of list) {
    if (c.id !== main.id) await mergeRow(conn, c.id, main.id)
  }
  return main
}

/** 解析前端可选的当前登录用户 id（bindUserId），行不存在则忽略 */
async function findSelf(conn, bindUserId) {
  if (!bindUserId) return null
  const uid = Number(bindUserId)
  if (!uid) return null
  const [[row]] = await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [uid])
  return row || null
}

/**
 * 安全校验：客户端若传 bindUserId（要把当前登录行并入新账号），必须同时带
 * 对应 JWT 且 payload.uid 一致，防止拿他人 user id 把对方订单合并到自己名下。
 */
async function assertCanBind(req, bindUserId) {
  if (!bindUserId) return
  const auth = String(req.headers.authorization || '')
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const payload = verifyToken(token)
  if (!payload || !payload.uid || Number(payload.uid) !== Number(bindUserId)) {
    throw { status: 403, message: '无权绑定该账号（请先登录）' }
  }
}

// ==================== 匿名访客（过渡身份，兼作后续升级底座） ====================
// body: { guestId, nickname?, bindUserId? }  →  { token:JWT, user }
router.post('/guest', async (req, res) => {
  try {
    const guestId = String((req.body && req.body.guestId) || '').trim()
    if (!guestId || guestId.length < 8 || guestId.length > 64) {
      return res.status(400).json({ error: 'bad guestId' })
    }
    const bindUserId = (req.body && req.body.bindUserId) || ''
    const nickname = String((req.body && req.body.nickname) || '').slice(0, 32)
    const user = await withTx(async conn => {
      const self = await findSelf(conn, bindUserId)
      const [[g]] = await conn.query('SELECT * FROM users WHERE guest_id = ? FOR UPDATE', [guestId])
      let main
      if (self) {
        main = self // 已有登录态（手机号/微信/guest）→ 保持同一账号
      } else if (g) {
        main = g
      } else {
        const r = await conn.query(
          'INSERT INTO users (guest_id, nickname) VALUES (?, ?)',
          [guestId, nickname || '']
        )
        main = { id: r[0].insertId, guest_id: guestId, nickname }
      }
      // 匿名期 guest 行（若与主行不同）→ 订单/资料并入主行，避免双账号
      if (g && g.id !== main.id) await mergeRow(conn, g.id, main.id)
      if (!main.guest_id) await conn.query('UPDATE users SET guest_id = ? WHERE id = ?', [guestId, main.id])
      const [[row]] = await conn.query('SELECT * FROM users WHERE id = ?', [main.id])
      return row
    })
    res.json({ token: signToken(user.id), user: publicUser(user) })
  } catch (e) {
    console.error('[auth] guest 失败：', e && e.message)
    res.status(500).json({ error: String((e && e.message) || e) })
  }
})

// ==================== 短信验证码 ====================
// 前端登录态/UI 自检（不含任何密钥）
router.get('/config', (req, res) => {
  const appid = process.env.WX_OAUTH_APPID || process.env.WXPAY_SP_APPID || ''
  const secret = process.env.WX_OAUTH_SECRET || ''
  res.json({
    wechatReady: !!(appid && secret),
    wxOauthMode: process.env.WX_OAUTH_MODE || 'oa',
    sms: smsMode(),
    payReady: !!(process.env.WXPAY_SP_MCHID && process.env.WXPAY_APIV3_KEY && process.env.WXPAY_MERCHANT_SERIAL)
  })
})

// POST /api/auth/sms/send { phone } → debug 模式回显 { code }，tencent 模式真发
router.post('/sms/send', async (req, res) => {
  const phone = String((req.body && req.body.phone) || '').trim()
  if (!validPhone(phone)) return res.status(400).json({ error: '手机号格式不正确' })
  try {
    const r = await sendCode(phone)
    res.json(r) // { ok:true, debug:true, code:'123456' } | { ok:true, debug:false }
  } catch (e) {
    res.status(e && e.status ? e.status : 500).json({ error: (e && e.message) || '发送失败' })
  }
})

// POST /api/auth/sms/login { phone, code, guestId?, bindUserId?, nickname? }
//   → 账号统一（guest/当前登录账号并入手机号主账号）→ { token:JWT, user }
router.post('/sms/login', async (req, res) => {
  const phone = String((req.body && req.body.phone) || '').trim()
  const code = String((req.body && req.body.code) || '').trim()
  const guestId = String((req.body && req.body.guestId) || '').trim() || null
  const bindUserId = (req.body && req.body.bindUserId) || ''
  const nickname = String((req.body && req.body.nickname) || '').slice(0, 32)
  if (!validPhone(phone)) return res.status(400).json({ error: '手机号格式不正确' })
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: '验证码为 6 位数字' })
  try {
    await assertCanBind(req, bindUserId) // bindUserId 需对应 JWT（防越权合并）
    await consumeCode(phone, code) // 校验并消费
    const user = await withTx(async conn => {
      const self = await findSelf(conn, bindUserId)
      const [[pg]] = guestId
        ? await conn.query('SELECT * FROM users WHERE guest_id = ? FOR UPDATE', [guestId])
        : [[]]
      const [[pu]] = await conn.query('SELECT * FROM users WHERE phone = ? FOR UPDATE', [phone])
      // 候选：已登录行（无 phone 时才可作为待绑定的壳）、guest 行、既有手机号行
      const cands = []
      if (self && !self.phone) cands.push(self)
      if (pu) cands.push(pu)
      if (pg) cands.push(pg)
      let main = await pickMain(conn, cands)
      if (!main) {
        const r = await conn.query('INSERT INTO users (phone, nickname) VALUES (?, ?)', [phone, nickname])
        main = { id: r[0].insertId }
      }
      if (!main.phone) await conn.query('UPDATE users SET phone = ? WHERE id = ?', [phone, main.id])
      if (nickname && !main.nickname) {
        await conn.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname, main.id])
      }
      const [[row]] = await conn.query('SELECT * FROM users WHERE id = ?', [main.id])
      return row
    })
    res.json({ token: signToken(user.id), user: publicUser(user) })
  } catch (e) {
    const status = (e && e.status) || 500
    if (status >= 500) console.error('[auth] sms/login 失败：', e && e.message)
    res.status(status).json({ error: (e && e.message) || '登录失败' })
  }
})

// ==================== 微信网页授权登录 ====================
// body: { code, guestId?, bindUserId? } → code 换 openid → 统一账号 → { token:JWT, user }
// 配置：.env 配 WX_OAUTH_APPID + WX_OAUTH_SECRET（服务号）；WX_OAUTH_MODE=oa|mp
router.post('/wechat', async (req, res) => {
  const appid = process.env.WX_OAUTH_APPID || process.env.WXPAY_SP_APPID || ''
  const secret = process.env.WX_OAUTH_SECRET || ''
  const code = String((req.body && req.body.code) || '').trim()
  if (!code) return res.status(400).json({ error: 'missing code' })
  if (!appid || !secret) {
    return res.status(501).json({ error: '微信登录未配置（缺 WX_OAUTH_APPID/WX_OAUTH_SECRET）' })
  }
  const guestId = String((req.body && req.body.guestId) || '').trim() || null
  const bindUserId = (req.body && req.body.bindUserId) || ''
  try {
    await assertCanBind(req, bindUserId) // bindUserId 需对应 JWT（防越权合并）
    // 1) code 换 openid/unionid（oa=服务号网页授权；mp=小程序 code2session）
    const mode = process.env.WX_OAUTH_MODE || 'oa'
    const api = mode === 'mp'
      ? `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
      : `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
    const j = await fetch(api).then(r => r.json())
    if (!j.openid) {
      return res.status(400).json({ error: '微信授权失败：' + ((j && (j.errmsg || j.errcode)) || 'invalid code') })
    }
    let nickname = ''
    let avatar = ''
    // 网页授权拿到 access_token 时可顺手拉用户资料（静默授权则无，跳过）
    if (j.access_token && mode !== 'mp') {
      try {
        const u = await fetch(`https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(j.access_token)}&openid=${encodeURIComponent(j.openid)}&lang=zh_CN`).then(r => r.json())
        if (u.nickname) nickname = String(u.nickname).slice(0, 32)
        if (u.headimgurl) avatar = String(u.headimgurl)
        if (u.unionid && !j.unionid) j.unionid = u.unionid
      } catch (e) { /* 资料拉取失败不阻断登录 */ }
    }
    // 2) 统一账号
    const user = await withTx(async conn => {
      const self = await findSelf(conn, bindUserId)
      const [[pg]] = guestId
        ? await conn.query('SELECT * FROM users WHERE guest_id = ? FOR UPDATE', [guestId])
        : [[]]
      const [[ou]] = await conn.query('SELECT * FROM users WHERE openid = ? FOR UPDATE', [j.openid])
      // 已登录手机号账号 + 微信新 openid → 手机号行为主，openid 并入（mergeRow 转移 openid）
      let cands = [ou]
      if (self && self.id !== (ou && ou.id)) cands.push(self)
      if (pg && pg.id !== (ou && ou.id) && pg.id !== (self && self.id)) cands.push(pg)
      let main = await pickMain(conn, cands)
      if (!main) {
        const r = await conn.query(
          'INSERT INTO users (openid, unionid, nickname, avatar) VALUES (?, ?, ?, ?)',
          [j.openid, j.unionid || '', nickname || '', avatar || '']
        )
        main = { id: r[0].insertId }
      }
      if (!main.openid) {
        await conn.query('UPDATE users SET openid = ?, unionid = COALESCE(NULLIF(?, ""), unionid) WHERE id = ?',
          [j.openid, j.unionid || '', main.id])
      } else if (j.unionid && !main.unionid) {
        await conn.query('UPDATE users SET unionid = ? WHERE id = ?', [j.unionid, main.id])
      }
      if (nickname && !main.nickname) await conn.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname, main.id])
      if (avatar && !main.avatar) await conn.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, main.id])
      const [[row]] = await conn.query('SELECT * FROM users WHERE id = ?', [main.id])
      return row
    })
    res.json({ token: signToken(user.id), user: publicUser(user) })
  } catch (e) {
    const status = (e && e.status) || 500
    if (status >= 500) console.error('[auth] wechat 失败：', e && e.message)
    res.status(status).json({ error: (e && e.message) || '微信登录失败' })
  }
})

export default router
