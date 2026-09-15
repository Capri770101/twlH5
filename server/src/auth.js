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
import { hashPassword, verifyPassword, validUsername, validPassword } from './password.js'

const router = express.Router()

/** 取 MySQL 数字错误码。
 *  ⚠️ mysql2 的 e.code 是字符串（如 'ER_TABLEACCESS_DENIED_ERROR'），直接 Number() 会得 NaN
 *  → 用 e.errno（数字）优先，退化为数字型 e.code。 */
function mysqlErrno(e) {
  if (!e) return 0
  if (typeof e.errno === 'number') return e.errno
  const n = Number(e.code)
  return Number.isFinite(n) ? n : 0
}

// 启动即幂等建短信码表。应用账号(h5_app)无 DDL 权限属预期（表由 root 预建），
// 仅权限类错误静默降噪，其他失败仍告警。
ensureSmsTable().catch(e => {
  const c = mysqlErrno(e)
  if (![1044, 1045, 1050, 1142].includes(c)) console.warn('[auth] sms_codes 建表失败：', e && e.message)
})

// 账号密码字段（username / password_hash）应由 root 执行 server/sql/2026-09-15_users_auth.sql 补齐；
// 此处仅在有 DDL 权限时尝试自动补列，无权限（h5_app）静默跳过。
async function ensureUserAuthColumns() {
  const stmts = [
    "ALTER TABLE users ADD COLUMN username VARCHAR(32) NULL COMMENT '账号' AFTER unionid",
    "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL COMMENT '密码哈希(scrypt)' AFTER username",
    'ALTER TABLE users ADD UNIQUE KEY uk_username (username)'
  ]
  for (const sql of stmts) {
    try { await hq(sql) } catch (e) {
      const c = mysqlErrno(e)
      // 1060 列已存在 / 1061 索引已存在 / 1044·1045·1142 无权限（h5_app 无 DDL）→ 均为预期，跳过
      if (![1060, 1061, 1044, 1045, 1142].includes(c)) {
        console.warn('[auth] users 账号字段补齐跳过：', e && e.message)
      }
    }
  }
}
ensureUserAuthColumns().catch(() => {})

// ---------- 展示层用户形状 ----------
function publicUser(u) {
  return {
    id: String(u.id),
    nickname: u.nickname || (u.phone ? '花友' + String(u.phone).slice(-4) : '微信用户'),
    avatar: u.avatar || '',
    phone: u.phone || '',
    openid: u.openid || '',
    unionid: u.unionid || '',
    username: u.username || '',
    hasPassword: !!u.password_hash,
    guest: !u.phone && !u.openid && !u.unionid && !u.username
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
  const openAppid = process.env.WX_OPEN_APPID || ''
  const openSecret = process.env.WX_OPEN_SECRET || ''
  res.json({
    wechatReady: !!(appid && secret),
    wxOauthMode: process.env.WX_OAUTH_MODE || 'oa',
    // PC 端扫码登录（开放平台网站应用）：前端据此决定跳 qrconnect 还是引导去微信内打开
    pcWechatReady: !!(openAppid && openSecret),
    wxOpenAppid: openAppid,
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

// ==================== 账号 + 密码（注册 / 登录） ====================
// POST /api/auth/register { username, password, phone, code, guestId?, bindUserId?, nickname? }
//   注册即绑定手机号（短信验证码校验），成功后直接签发 JWT 登录。
//   规则：账号唯一；手机号若已注册则复用该行（未设过账号密码时为其补设），避免重复开号。
router.post('/register', async (req, res) => {
  const username = String((req.body && req.body.username) || '').trim()
  const password = String((req.body && req.body.password) || '')
  const phone = String((req.body && req.body.phone) || '').trim()
  const code = String((req.body && req.body.code) || '').trim()
  const nickname = String((req.body && req.body.nickname) || '').slice(0, 32)
  const guestId = String((req.body && req.body.guestId) || '').trim() || null
  const bindUserId = (req.body && req.body.bindUserId) || ''

  if (!validUsername(username)) return res.status(400).json({ error: '账号需字母开头，4-20 位字母/数字/下划线' })
  if (!validPassword(password)) return res.status(400).json({ error: '密码长度需 6-32 位' })
  if (!validPhone(phone)) return res.status(400).json({ error: '手机号格式不正确' })
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: '验证码为 6 位数字' })

  try {
    await assertCanBind(req, bindUserId) // bindUserId 需对应 JWT（防越权合并）
    await consumeCode(phone, code)       // 手机号短信校验并消费
    const user = await withTx(async conn => {
      const [[uExist]] = await conn.query('SELECT id FROM users WHERE username = ? FOR UPDATE', [username])
      if (uExist) throw { status: 409, message: '该账号已被注册，请更换' }
      const [[pExist]] = await conn.query('SELECT * FROM users WHERE phone = ? FOR UPDATE', [phone])
      const self = await findSelf(conn, bindUserId)
      let main
      if (pExist) {
        // 手机号已存在：若该行还没设账号，则为其补设（升级为账号密码登录）；已有别的账号则拒绝
        if (pExist.username && pExist.username !== username) {
          throw { status: 409, message: '该手机号已注册，请直接登录' }
        }
        main = pExist
      } else if (self && !self.phone) {
        main = self // 复用当前匿名壳，保留其订单 / 地址
      } else {
        const r = await conn.query('INSERT INTO users (phone) VALUES (?)', [phone])
        main = { id: r[0].insertId }
      }
      // 匿名壳（若与主行不同）并入主行，避免双账号
      if (self && self.id !== main.id && !self.phone) await mergeRow(conn, self.id, main.id)
      await conn.query(
        'UPDATE users SET username = ?, password_hash = ?, phone = ?, nickname = COALESCE(NULLIF(?, ""), nickname) WHERE id = ?',
        [username, hashPassword(password), phone, nickname, main.id]
      )
      const [[row]] = await conn.query('SELECT * FROM users WHERE id = ?', [main.id])
      return row
    })
    console.log('[auth/register] 注册成功: uid=%s username=%s', user.id, username)
    res.json({ token: signToken(user.id), user: publicUser(user) })
  } catch (e) {
    const status = (e && e.status) || 500
    if (status >= 500) console.error('[auth/register] 失败：', e && e.message)
    res.status(status).json({ error: (e && e.message) || '注册失败' })
  }
})

// POST /api/auth/password/login { account, password }
//   account 支持「账号」或「手机号」；错误统一提示，避免账号枚举。
router.post('/password/login', async (req, res) => {
  const account = String((req.body && req.body.account) || '').trim()
  const password = String((req.body && req.body.password) || '')
  if (!account || !password) return res.status(400).json({ error: '请输入账号和密码' })
  try {
    const isPhone = validPhone(account)
    const sql = isPhone
      ? 'SELECT * FROM users WHERE phone = ? LIMIT 1'
      : 'SELECT * FROM users WHERE username = ? LIMIT 1'
    const rows = await hq(sql, [account])
    const row = rows && rows[0]
    if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: '账号或密码错误' })
    }
    console.log('[auth/password/login] 登录成功: uid=%s account=%s', row.id, isPhone ? 'phone' : 'username')
    res.json({ token: signToken(row.id), user: publicUser(row) })
  } catch (e) {
    console.error('[auth/password/login] 失败：', e && e.message)
    res.status(500).json({ error: '登录失败' })
  }
})

// ==================== 微信网页授权登录 ====================
// body: { code, guestId?, bindUserId? } → code 换 openid → 统一账号 → { token:JWT, user }
// 配置：.env 配 WX_OAUTH_APPID + WX_OAUTH_SECRET（服务号）；WX_OAUTH_MODE=oa|mp
// ==================== 微信账号归一（公众号网页授权 / 开放平台扫码 共用） ====================
/**
 * 按 openid/unionid 匹配或创建用户行（事务内）。
 * 关键：手机端(公众号)与 PC 端(网站应用)的 openid 不同（不同 appid 派生），
 *      跨端同一人靠 unionid 匹配（前提：公众号与网站应用绑定同一开放平台账号）。
 * users.openid 语义 = 该行最近一次微信登录渠道的 openid（换端登录时被 unionid 匹配复用，
 * 重新写入新渠道 openid），unionid 才是跨端主键。
 */
async function wechatUpsert(conn, { openid, unionid, nickname, avatar, guestId, bindUserId }) {
  const self = await findSelf(conn, bindUserId)
  const [[pg]] = guestId
    ? await conn.query('SELECT * FROM users WHERE guest_id = ? FOR UPDATE', [guestId])
    : [[]]
  const [[ou]] = openid
    ? await conn.query('SELECT * FROM users WHERE openid = ? FOR UPDATE', [openid])
    : [[]]
  const [[un]] = unionid
    ? await conn.query('SELECT * FROM users WHERE unionid = ? FOR UPDATE', [unionid])
    : [[]]
  // 候选行：openid 行 / unionid 行 / 当前登录行 / guest 行 → pickMain 归一并入（手机号行优先）
  let cands = [ou, un]
  for (const c of [self, pg]) {
    if (c && !cands.some(x => x && x.id === c.id)) cands.push(c)
  }
  let main = await pickMain(conn, cands)
  if (!main) {
    const r = await conn.query(
      'INSERT INTO users (openid, unionid, nickname, avatar) VALUES (?, ?, ?, ?)',
      [openid || '', unionid || '', nickname || '', avatar || '']
    )
    main = { id: r[0].insertId }
  }
  if (openid && !main.openid) {
    await conn.query('UPDATE users SET openid = ?, unionid = COALESCE(NULLIF(?, ""), unionid) WHERE id = ?',
      [openid, unionid || '', main.id])
  } else if (unionid && !main.unionid) {
    await conn.query('UPDATE users SET unionid = ? WHERE id = ?', [unionid, main.id])
  }
  if (nickname && !main.nickname) await conn.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname, main.id])
  if (avatar && !main.avatar) await conn.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, main.id])
  const [[row]] = await conn.query('SELECT * FROM users WHERE id = ?', [main.id])
  return row
}

// ------------------------- 手机端：公众号网页授权 -------------------------
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
  console.log('[auth/wechat] 请求: code=%s*(len=%d) guestId=%s bindUserId=%s ua=%s',
    code.slice(0, 6), code.length, guestId || '-', bindUserId || '-',
    String(req.headers['user-agent'] || '').slice(0, 60))
  try {
    await assertCanBind(req, bindUserId) // bindUserId 需对应 JWT（防越权合并）
    // 1) code 换 openid/unionid（oa=服务号网页授权；mp=小程序 code2session）
    const mode = process.env.WX_OAUTH_MODE || 'oa'
    const api = mode === 'mp'
      ? `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
      : `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
    const j = await fetch(api).then(r => r.json())
    console.log('[auth/wechat] 微信返回: errcode=%s errmsg=%s openid=%s scope=%s mode=%s appid=%s',
      j.errcode ?? 'ok', j.errmsg || '-', j.openid ? j.openid.slice(0, 6) + '*' : '无', j.scope || '-', mode, appid)
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
      } catch (e) { console.error('[auth/wechat] userinfo 拉取失败(不阻断):', e && e.message) }
    }
    // 2) 统一账号（openid + unionid 双匹配）
    const user = await withTx(conn => wechatUpsert(conn, {
      openid: j.openid, unionid: j.unionid || '', nickname, avatar,
      guestId, bindUserId
    }))
    console.log('[auth/wechat] 登录成功: uid=%s nickname=%s', user.id, user.nickname || '-')
    res.json({ token: signToken(user.id), user: publicUser(user) })
  } catch (e) {
    const status = (e && e.status) || 500
    console.error('[auth/wechat] 失败 status=%s:', status, e && (e.message || e))
    res.status(status).json({ error: (e && e.message) || '微信登录失败' })
  }
})

// ------------------------- PC 端：微信开放平台「网站应用」扫码登录 -------------------------
// 流程：PC 前端跳 open.weixin.qq.com/connect/qrconnect(scope=snsapi_login) → 用户手机扫码确认
//      → 回跳带 code → 本路由用 WX_OPEN_APPID/SECRET 换 token/openid/unionid → unionid 跨端归一。
// 前置：微信公众平台注册的「网站应用」审核通过，且服务号绑定到同一开放平台账号（unionid 一致）。
router.post('/wechat-pc', async (req, res) => {
  const appid = process.env.WX_OPEN_APPID || ''
  const secret = process.env.WX_OPEN_SECRET || ''
  const code = String((req.body && req.body.code) || '').trim()
  if (!code) return res.status(400).json({ error: 'missing code' })
  if (!appid || !secret) {
    return res.status(501).json({ error: 'PC 扫码登录未配置（缺 WX_OPEN_APPID/WX_OPEN_SECRET，需微信开放平台网站应用审核通过）' })
  }
  const guestId = String((req.body && req.body.guestId) || '').trim() || null
  const bindUserId = (req.body && req.body.bindUserId) || ''
  console.log('[auth/wechat-pc] 请求: code=%s*(len=%d) guestId=%s bindUserId=%s ua=%s',
    code.slice(0, 6), code.length, guestId || '-', bindUserId || '-',
    String(req.headers['user-agent'] || '').slice(0, 60))
  try {
    await assertCanBind(req, bindUserId)
    // 1) code 换 access_token/openid/unionid（网站应用扫码登录，同一端点不同 appid）
    const api = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
    const j = await fetch(api).then(r => r.json())
    console.log('[auth/wechat-pc] 微信返回: errcode=%s errmsg=%s openid=%s unionid=%s appid=%s',
      j.errcode ?? 'ok', j.errmsg || '-', j.openid ? j.openid.slice(0, 6) + '*' : '无',
      j.unionid ? j.unionid.slice(0, 6) + '*' : '无', appid)
    if (!j.openid) {
      return res.status(400).json({ error: '微信扫码登录失败：' + ((j && (j.errmsg || j.errcode)) || 'invalid code') })
    }
    // 2) snsapi_login 必有 access_token → 拉用户资料（昵称/头像 + unionid 兜底）
    let nickname = ''
    let avatar = ''
    try {
      const u = await fetch(`https://api.weixin.qq.com/sns/userinfo?access_token=${encodeURIComponent(j.access_token)}&openid=${encodeURIComponent(j.openid)}&lang=zh_CN`).then(r => r.json())
      if (u.nickname) nickname = String(u.nickname).slice(0, 32)
      if (u.headimgurl) avatar = String(u.headimgurl)
      if (u.unionid && !j.unionid) j.unionid = u.unionid
    } catch (e) { console.error('[auth/wechat-pc] userinfo 拉取失败(不阻断):', e && e.message) }
    // 3) 统一账号（unionid 跨端匹配：与手机端同一微信用户落到同一行）
    const user = await withTx(conn => wechatUpsert(conn, {
      openid: j.openid, unionid: j.unionid || '', nickname, avatar,
      guestId, bindUserId
    }))
    console.log('[auth/wechat-pc] 登录成功: uid=%s nickname=%s', user.id, user.nickname || '-')
    res.json({ token: signToken(user.id), user: publicUser(user) })
  } catch (e) {
    const status = (e && e.status) || 500
    console.error('[auth/wechat-pc] 失败 status=%s:', status, e && (e.message || e))
    res.status(status).json({ error: (e && e.message) || 'PC 微信扫码登录失败' })
  }
})

// ==================== PC 端：H5 扫码中转登录（方案 B，无需开放平台审核） ====================
// 流程：PC 前端生成随机 ticket → 展示二维码（内容 = https://h5.tiaowulan.com/login?pc=<ticket>）→
//      手机微信扫码打开 H5 → 公众号网页授权 snsapi_userinfo 登录（有同意框，符合硬策略）→
//      手机端 POST /auth/pc-approve {ticket}（带 Bearer JWT）→
//      PC 前端轮询 GET /auth/pc-status?ticket=xxx → approved 时下发同一 uid 的 JWT → PC 登录完成。
// 安全：ticket 为前端 crypto 随机 32 位 hex，服务端格式校验；TTL 5 分钟；approve 后一次性消费。
//       approve 必须 Bearer（手机端已登录）；status 无需鉴权（ticket 本身即为一次性凭据，随机不可猜）。
const pcTickets = new Map() // ticket -> { uid, expires }
const PC_TICKET_TTL = 5 * 60 * 1000
const PC_TICKET_RE = /^[a-f0-9]{16,64}$/i

function sweepPcTickets() {
  const now = Date.now()
  for (const [k, v] of pcTickets) if (v.expires < now) pcTickets.delete(k)
}

// 手机端：扫码后把 PC 票据绑定到当前登录账号
router.post('/pc-approve', async (req, res) => {
  try {
    const ticket = String((req.body && req.body.ticket) || '').trim()
    if (!PC_TICKET_RE.test(ticket)) return res.status(400).json({ error: 'invalid ticket' })
    const auth = String(req.headers.authorization || '')
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    const payload = verifyToken(token)
    if (!payload || !payload.uid) return res.status(401).json({ error: '请先在手机上完成微信登录' })
    const uid = Number(payload.uid)
    const rows = await hq('SELECT * FROM users WHERE id = ?', [uid])
    if (!rows || !rows.length) return res.status(401).json({ error: '账号不存在' })
    sweepPcTickets()
    pcTickets.set(ticket, { uid, expires: Date.now() + PC_TICKET_TTL })
    console.log('[auth/pc-approve] 票据授权: uid=%s nickname=%s', uid, rows[0].nickname || '-')
    res.json({ ok: true })
  } catch (e) {
    console.error('[auth/pc-approve] 失败:', e && (e.message || e))
    res.status(500).json({ error: '票据授权失败' })
  }
})

// PC 端：轮询票据状态；approved 时下发同一账号 JWT 并消费票据（一次性）
router.get('/pc-status', async (req, res) => {
  try {
    const ticket = String((req.query && req.query.ticket) || '').trim()
    if (!PC_TICKET_RE.test(ticket)) return res.status(400).json({ error: 'invalid ticket' })
    sweepPcTickets()
    const t = pcTickets.get(ticket)
    if (!t) return res.json({ status: 'pending' })
    const rows = await hq('SELECT * FROM users WHERE id = ?', [t.uid])
    pcTickets.delete(ticket) // 一次性消费：无论结果如何都作废，防重放
    if (!rows || !rows.length) return res.json({ status: 'pending' })
    console.log('[auth/pc-status] PC 登录完成: uid=%s nickname=%s', rows[0].id, rows[0].nickname || '-')
    res.json({ status: 'approved', token: signToken(rows[0].id), user: publicUser(rows[0]) })
  } catch (e) {
    console.error('[auth/pc-status] 失败:', e && (e.message || e))
    res.status(500).json({ error: '票据状态查询失败' })
  }
})

export default router
