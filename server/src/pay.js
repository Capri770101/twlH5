// 微信支付「服务商模式」支付路由：下单(JSAPI/H5) / 查询 / 关单 / 退款 / 回调
// 复用跳舞兰服务商号 + 各花店 sub_mchid。
//
// 分账（profit_sharing）说明：
//   settle_info.profit_sharing=true 只是把订单标记为「可分账」，资金随即进入分账冻结
//   （普通服务商分账默认冻结 30 天，超期未发起分账会自动解冻给分账方），微信**不会自动分账**。
//   因此只有「该店确实有佣金」**且**「分账队列真的启用」时才标记 —— 否则钱会被白冻。
//   实际发起分账见 profitsharing.js（支付成功满 N 小时后扫描执行）。
import express from 'express'
import fs from 'fs'
import { wxpayRequest, decryptResource, verifyNotify, buildJsapiPayParams, WXPAY, WX_API_BASE } from './wxpay.js'
import { hq, withTx } from './h5db.js'
import { resolveSubMch } from './submch.js'
import { resolveUser as resolveTokenUser } from './token.js'
import {
  PS, markPending, scanOnce, ensureReturnedBeforeRefund, psStatusForOrder, addReceiver,
  calcCommission, forceShare, psStats
} from './profitsharing.js'

const router = express.Router()

// 兼容旧引用：resolveSubMch 已移到 submch.js（pay.js 与 profitsharing.js 共用，避免循环 import）
export { resolveSubMch }

/** 取用户终端 IPv4：前端传入 → X-Forwarded-For（nginx 已设）→ 直连地址。取不到返回 '' */
function resolveClientIp(req, fromBody) {
  const cands = [
    fromBody,
    String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0],
    (req.socket && req.socket.remoteAddress) || ''
  ]
  for (let v of cands) {
    v = String(v || '').trim().replace(/^::ffff:/, '')
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v) && !v.startsWith('10.') && !v.startsWith('127.')) return v
  }
  // 兜底：内网地址也接受（本地联调场景），总比直接失败好
  for (let v of cands) {
    v = String(v || '').trim().replace(/^::ffff:/, '')
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) return v
  }
  return ''
}

// ---------- 下单（JSAPI / H5） ----------
// body: { shopId, outTradeNo, amountFen, description, openid?, tradeType?('JSAPI'|'H5'), clientIp? }
router.post('/order', async (req, res) => {
  try {
    const { shopId, outTradeNo, amountFen, description, openid, tradeType = 'JSAPI', clientIp } = req.body
    if (!shopId || !outTradeNo || !amountFen) return res.status(400).json({ error: 'missing shopId/outTradeNo/amountFen' })
    // 校验订单：必须存在、处于待支付、且金额与库中一致（以 DB 为准，防篡改金额）
    const ordRows = await hq('SELECT id, total_price, status, shop_id FROM orders WHERE id = ? LIMIT 1', [outTradeNo])
    if (!ordRows.length) return res.status(404).json({ error: '订单不存在' })
    const ord = ordRows[0]
    if (ord.status !== 'pending') return res.status(409).json({ error: '订单当前状态不可支付：' + ord.status })
    const dbAmount = Math.round(Number(ord.total_price) || 0)
    if (dbAmount <= 0) return res.status(400).json({ error: '订单金额异常' })
    if (Math.round(Number(amountFen)) !== dbAmount) {
      return res.status(400).json({ error: '支付金额与订单不一致（应为 ' + dbAmount + ' 分）' })
    }
    // 店铺以订单归属为准（防前端传错店导致分账对象错误）
    const sub = await resolveSubMch(String(ord.shop_id || shopId))
    const body = {
      sp_appid: WXPAY.spAppid,
      sp_mchid: WXPAY.spMchid,
      sub_mchid: sub.subMchid,
      description: String(description || '跳舞兰AI花店订单').slice(0, 127),
      out_trade_no: String(outTradeNo),
      notify_url: WXPAY.notifyUrl,
      amount: { total: dbAmount, currency: 'CNY' }
    }
    // sub_appid 只在「确实配置了子商户自己的 appid」时才带。
    // 曾把 sub_appid 回落成服务商自己的 appid → 微信判为非法请求（400 INVALID_REQUEST），
    // 导致 H5 的下单接口一直失败。留空则由微信按 sp_appid 下的 openid 处理。
    if (sub.subAppid && sub.subAppid !== WXPAY.spAppid) body.sub_appid = sub.subAppid
    // ⚠️ 这里**不要**预先关单！
    // 实测（2026-09-16）：对从未下单过的 out_trade_no 调关单，微信返回成功（204），
    // 随后再用同一 out_trade_no 下单就报
    //   400 INVALID_REQUEST「请求重入时，参数与首次请求时不一致」
    // 即"先关后下"会把订单号提前废掉。改回：仅当确实存在未支付单时才关（见 /order 上层逻辑），
    // 此处不做任何预处理。
    // 仅当「该店佣金 > 0」**且**「分账队列已启用」才标记需要分账。
    // 只标记却不真正分账 = 花店资金被白冻 30 天，所以两个条件必须同时满足。
    // 微信分账只能按金额（不能按比例），比例需自行折算成金额后传。
    const settleRatio = Number(sub.settleRatio) || 0
    // 与分账执行端用同一个函数算佣金，避免"标记了却不分"或反之
    const commission = calcCommission(dbAmount, settleRatio)
    const psMarked = commission > 0 && PS.enabled
    if (psMarked) body.settle_info = { profit_sharing: true }
    console.log('[pay] 下单 out_trade_no=%s shop=%s 金额=%d分 佣金比例=%s%% 佣金=%d分 标记分账=%s%s',
      body.out_trade_no, ord.shop_id || shopId, dbAmount, settleRatio, commission,
      psMarked ? '是' : '否',
      psMarked ? '' : (commission > 0 ? '（分账队列未启用）' : '（零佣金）'))
    if (tradeType === 'JSAPI') {
      if (!openid) return res.status(400).json({ error: 'JSAPI 需要 openid' })
      body.payer = { sp_openid: openid }
    } else if (tradeType === 'H5') {
      // H5(MWEB) 支付：scene_info.payer_client_ip 是**微信必填**（用于风控），缺了直接 400
      // ⚠️ 只有 H5 需要 scene_info；NATIVE 带上会被判「含未定义参数」
      const ip = resolveClientIp(req, clientIp)
      if (!ip) {
        return res.status(400).json({ error: 'H5 支付需要有效的用户终端 IPv4（scene_info.payer_client_ip）' })
      }
      body.scene_info = {
        payer_client_ip: ip,
        h5_info: {
          type: 'Wap',
          app_name: '跳舞兰AI花店',
          app_url: WXPAY.h5RedirectUrl || 'https://tiaowulan.com'
        }
      }
    }
    const apiPath = tradeType === 'H5'
      ? '/v3/pay/partner/transactions/h5'
      : tradeType === 'NATIVE'
        ? '/v3/pay/partner/transactions/native'
        : '/v3/pay/partner/transactions/jsapi'
    const r = await wxpayRequest('POST', apiPath, body)
    if (tradeType === 'H5') {
      let h5Url = r.h5_url
      if (WXPAY.h5RedirectUrl) {
        h5Url += (h5Url.includes('?') ? '&' : '?') + 'redirect_url=' + encodeURIComponent(WXPAY.h5RedirectUrl)
      }
      return res.json({ tradeType: 'H5', h5_url: h5Url })
    }
    if (tradeType === 'NATIVE') {
      // PC 扫码支付：微信返回 code_url（weixin://wxpay/bizpayurl?pr=xxx）
      // 二维码在后端生成 data URL —— 只有 PC 用得到，不必为此给移动端也打包一个 QR 库
      let qrDataUrl = ''
      try {
        const QR = await import('qrcode')
        qrDataUrl = await QR.toDataURL(r.code_url, { margin: 1, width: 320 })
      } catch (e) {
        console.warn('[pay] 生成二维码失败（前端可自行用 code_url 渲染）：', e.message)
      }
      return res.json({ tradeType: 'NATIVE', code_url: r.code_url, qrDataUrl })
    }
    const payParams = buildJsapiPayParams(r.prepay_id, WXPAY.spAppid)
    return res.json({ tradeType: 'JSAPI', ...payParams })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
})

// ---------- 查询订单 ----------
router.get('/query/:outTradeNo', async (req, res) => {
  try {
    const subMchid = req.query.subMchid || (req.query.shopId ? (await resolveSubMch(req.query.shopId)).subMchid : null)
    if (!subMchid) return res.status(400).json({ error: 'missing subMchid or shopId' })
    // 服务商模式：sp_mchid 与 sub_mchid **都必须**带，否则 400 PARAM_ERROR
    const r = await wxpayRequest('GET',
      `/v3/pay/partner/transactions/out-trade-no/${encodeURIComponent(req.params.outTradeNo)}` +
      `?sp_mchid=${encodeURIComponent(WXPAY.spMchid)}&sub_mchid=${encodeURIComponent(subMchid)}`)
    // 自愈：微信侧已支付、而本地订单仍是待支付（回调丢失或延迟）→ 就地补记。
    // PC 扫码支付靠轮询这个接口，没有它就可能"钱付了、页面还显示待付款"。
    if (r && r.trade_state === 'SUCCESS') {
      try {
        await onPaid(String(req.params.outTradeNo), r.transaction_id, r, 'native')
      } catch (e) {
        console.warn('[pay] 查询补记支付状态失败：', e.message)
      }
    }
    return res.json(r)
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
})

// ---------- 关单 ----------
router.post('/close', async (req, res) => {
  try {
    const { outTradeNo, subMchid, shopId } = req.body
    const sub = subMchid || (shopId ? (await resolveSubMch(shopId)).subMchid : null)
    if (!sub || !outTradeNo) return res.status(400).json({ error: 'missing outTradeNo/subMchid' })
    await wxpayRequest('POST',
      `/v3/pay/partner/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`,
      { sp_mchid: WXPAY.spMchid, sub_mchid: sub }) // 同上：两个商户号都要带
    return res.json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
})

// ---------- 退款核心（pay 与 orders 共用） ----------
/**
 * 向微信发起一笔退款。**只负责出账，不碰订单状态**——订单状态由调用方按结果落库
 * （用户端入口：POST /api/orders/:id/refund）。
 * @returns {Promise<{ok:true, refundNo:string, amountFen:number, wxStatus:string, raw:object}>}
 * @throws  {{status:number, message:string}} 业务错误（含微信侧失败）
 */
export async function refundOrderCore(outTradeNo, { reason, amountFen, subMchid, shopId } = {}) {
  const sub = subMchid || (shopId ? (await resolveSubMch(shopId)).subMchid : null)
  if (!sub || !outTradeNo) throw { status: 400, message: 'missing outTradeNo/subMchid' }

  // ① 已分账的订单必须先回退分账资金再退款
  //    （微信规则：分账后退款需接收方同意，资金先回退到分账方账户；否则退款失败/资金对不上）
  const ret = await ensureReturnedBeforeRefund(String(outTradeNo))
  if (!ret.ok) throw { status: 409, message: ret.message || '分账回退未完成，暂不能退款' }

  // ② 金额以库中订单为准：amount.total 必须是**原订单总额**，refund 才是退款额（支持部分退款）
  const ordRows = await hq('SELECT id, total_price FROM orders WHERE id = ? LIMIT 1', [outTradeNo])
  if (!ordRows.length) throw { status: 404, message: '订单不存在' }
  const orderTotal = Math.round(Number(ordRows[0].total_price) || 0)
  const refundFen = amountFen ? Math.round(Number(amountFen)) : orderTotal
  if (!(refundFen > 0) || refundFen > orderTotal) {
    throw { status: 400, message: '退款金额不合法（应为 1 ~ ' + orderTotal + ' 分）' }
  }

  // ③ out_refund_no **由订单号派生**（原来用 'R'+Date.now()，每次都是新单号）。
  //    同一 out_refund_no 在微信侧是幂等的：重复调用只会返回**同一笔**退款，不会重复出账。
  //    这是「重复申请退款」在资金层面的最后一道闸门。
  const outRefundNo = 'R' + String(outTradeNo)
  const body = {
    sub_mchid: sub,
    out_trade_no: String(outTradeNo),
    out_refund_no: outRefundNo,
    reason: String(reason || '用户申请退款').slice(0, 80),
    amount: { refund: refundFen, total: orderTotal, currency: 'CNY' }
  }
  console.log('[pay] 发起退款 out_trade_no=%s out_refund_no=%s 退款=%d分/订单=%d分',
    outTradeNo, outRefundNo, refundFen, orderTotal)
  const r = await wxpayRequest('POST', '/v3/refund/domestic/refunds', body)
  // 微信返回 status：SUCCESS 已成功 / PROCESSING 处理中 / ABNORMAL 异常 / CLOSED 已关闭
  return { ok: true, refundNo: outRefundNo, amountFen: refundFen, wxStatus: String((r && r.status) || '').toUpperCase(), raw: r }
}

// ---------- 退款（服务商，直连底层接口） ----------
// ⚠️ 用户端**不应**直接调这个：它只出账、不写订单状态（历史 bug 的根源）。
//    用户申请退款请走 POST /api/orders/:id/refund。
//    这里补上「必须登录且是订单本人」的校验——否则知道订单号的人就能把别人订单退掉。
router.post('/refund', async (req, res) => {
  try {
    const { outTradeNo, reason, amountFen, shopId, subMchid } = req.body
    if (!outTradeNo) return res.status(400).json({ error: 'missing outTradeNo' })
    const u = await resolveTokenUser(req)
    const ordRows = await hq('SELECT user_id FROM orders WHERE id = ? LIMIT 1', [outTradeNo])
    if (!ordRows.length) return res.status(404).json({ error: '订单不存在' })
    const owner = ordRows[0].user_id
    if (!u || owner == null || Number(owner) !== Number(u.id)) {
      return res.status(403).json({ error: '无权对该订单发起退款' })
    }
    const r = await refundOrderCore(outTradeNo, { reason, amountFen, shopId, subMchid })
    return res.json(r)
  } catch (e) {
    return res.status((e && e.status) || 500).json({ error: String((e && e.message) || e) })
  }
})

// ---------- 回调通知（在 index.js 用 express.raw 挂载，rawBody 为字符串） ----------
export async function handleNotify(rawBody, headers) {
  const ok = await verifyNotify(rawBody, headers)
  if (!ok) {
    return { status: 401, json: { code: 'FAIL', message: '签名验证失败' } }
  }
  let data
  try { data = JSON.parse(rawBody) } catch (e) {
    return { status: 400, json: { code: 'FAIL', message: 'bad json' } }
  }
  let resource = data.resource
  let decrypted
  try { decrypted = JSON.parse(decryptResource(resource)) } catch (e) {
    return { status: 500, json: { code: 'FAIL', message: '解密失败' } }
  }
  // decrypted: { out_trade_no, transaction_id, trade_state, success_time, amount, ... }
  const { out_trade_no, transaction_id, trade_state } = decrypted
  if (trade_state === 'SUCCESS') {
    try {
      await onPaid(out_trade_no, transaction_id, decrypted)
    } catch (e) {
      // 落库失败必须返回非 200，微信才会重试；否则「钱已收、订单仍待付款」
      console.error('[pay] 回调落库失败，返回 500 等待微信重试：', e && e.message)
      return { status: 500, json: { code: 'FAIL', message: '处理失败，请稍后重试' } }
    }
  }
  return { status: 200, json: { code: 'SUCCESS', message: '成功' } }
}

// 支付成功：h5_shop.orders pending→paid + 落 payments 流水（幂等：仅首次生效）
// channelHint：渠道兜底值（如 'native'）——仅用于 payments.channel 归类，不影响资金
async function onPaid(outTradeNo, transactionId, decrypted, channelHint) {
  // ⚠️ 失败必须向上抛（handleNotify 会返回 5xx 让微信重试），不能吞掉，
  //    否则会出现「钱已收、订单永久待付款」的资损。
  await withTx(async conn => {
    // 仅当订单仍为 pending（待支付）才推进，重复回调自动跳过 → 流水不重复
    const [orders] = await conn.query(
      "SELECT id, shop_id, total_price, sub_mchid, pickup_method FROM orders WHERE id = ? AND status = 'pending' LIMIT 1",
      [outTradeNo]
    )
    const o = orders[0]
    if (!o) return
    await conn.query(
      'UPDATE orders SET status = ?, wx_transaction_id = ?, pay_time = NOW() WHERE id = ?',
      ['paid', transactionId, outTradeNo]
    )
    const amount = decrypted && decrypted.amount && decrypted.amount.payer_total
      ? Math.round(Number(decrypted.amount.payer_total))
      : o.total_price
    // JSAPI 回调带 payer(openid)，H5(MWEB) 无 payer → 用于区分 channel
    const channel = channelHint || (decrypted && decrypted.payer ? 'jsapi' : 'h5')
    await conn.query(
      `INSERT INTO payments (order_id, out_trade_no, transaction_id, channel, amount, status, sub_mchid, raw_callback)
       VALUES (?, ?, ?, ?, ?, 'success', ?, ?)`,
      [outTradeNo, outTradeNo, transactionId, channel, amount, o.sub_mchid,
        JSON.stringify(decrypted || {})]
    )
  })
  console.log('[pay] 支付成功已落库：', outTradeNo, transactionId)
  // 标记进入分账队列（零佣金门店自动跳过）。
  // 刻意不向上抛错：微信回调返回非 200 会触发重试，而"钱已收"远比"分账标记被打断"重要；
  // 万一标记失败，扫描任务只认 ps_state='pending'，可用 admin 接口手动补标（见 /ps/run）。
  try {
    await markPending(outTradeNo)
  } catch (e) {
    console.warn('[pay] 标记待分账失败（不影响支付落库）：', e.message)
  }
}

// ---------- 分账运维接口（需 WXPAY_PS_ADMIN_TOKEN，未配置则整体关闭） ----------
// 用于排障与真机联调：手动触发扫描 / 查订单分账状态 / 补加分账接收方。
function psAdminGuard(req, res) {
  const tok = String(process.env.WXPAY_PS_ADMIN_TOKEN || '')
  if (!tok) return false // 未配置令牌 → 视为不开放（下面的路由会 404）
  if (String(req.headers['x-ps-token'] || '') !== tok) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  return true
}

// 手动跑一次分账扫描（只处理到期的 pending 订单）
router.post('/ps/run', async (req, res) => {
  if (!process.env.WXPAY_PS_ADMIN_TOKEN) return res.status(404).json({ error: 'not found' })
  const g = psAdminGuard(req, res); if (g !== true) return
  try {
    const r = await scanOnce()
    return res.json({ ok: true, ...r })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
})

// 手动对指定订单发起分账（忽略"满 24 小时"限制）——真机联调/排障用
router.post('/ps/share/:id', async (req, res) => {
  if (!process.env.WXPAY_PS_ADMIN_TOKEN) return res.status(404).json({ error: 'not found' })
  const g = psAdminGuard(req, res); if (g !== true) return
  try {
    const r = await forceShare(String(req.params.id))
    const after = await psStatusForOrder(String(req.params.id))
    return res.json({ ok: !!r.ok, result: r, order: after })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
})

// 分账总览（各状态订单数）
router.get('/ps/stats', async (req, res) => {
  if (!process.env.WXPAY_PS_ADMIN_TOKEN) return res.status(404).json({ error: 'not found' })
  const g = psAdminGuard(req, res); if (g !== true) return
  try {
    return res.json({ ok: true, ...(await psStats()) })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
})

// 查某订单的分账状态
router.get('/ps/order/:id', async (req, res) => {
  if (!process.env.WXPAY_PS_ADMIN_TOKEN) return res.status(404).json({ error: 'not found' })
  const g = psAdminGuard(req, res); if (g !== true) return
  try {
    const r = await psStatusForOrder(String(req.params.id))
    return res.json({ ok: !!r, order: r })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
})

// 补加某店铺的分账接收方（幂等；正常流程会自动补加，这里仅用于预检）
router.post('/ps/add-receiver', async (req, res) => {
  if (!process.env.WXPAY_PS_ADMIN_TOKEN) return res.status(404).json({ error: 'not found' })
  const g = psAdminGuard(req, res); if (g !== true) return
  try {
    const sub = await resolveSubMch(String((req.body && req.body.shopId) || 's001'))
    const r = await addReceiver(sub.subMchid)
    return res.json({ ok: true, subMchid: sub.subMchid, result: r })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
})

// ---------- 支付配置自检（联调前先看这里缺什么） ----------
router.get('/status', async (req, res) => {
  const checks = [
    { key: 'WXPAY_SP_MCHID', ok: !!WXPAY.spMchid, hint: '服务商商户号（商户平台 → 账户中心）' },
    { key: 'WXPAY_SP_APPID', ok: !!WXPAY.spAppid, hint: '服务商绑定的服务号/小程序 appid' },
    { key: 'WXPAY_APIV3_KEY', ok: !!WXPAY.apiV3Key, hint: 'APIv3 密钥（32 位）' },
    { key: 'WXPAY_MERCHANT_SERIAL', ok: !!WXPAY.merchantSerial, hint: '商户 API 证书序列号' },
    { key: '商户私钥文件', ok: fs.existsSync(WXPAY.merchantKeyPath), hint: WXPAY.merchantKeyPath },
    { key: 'WXPAY_NOTIFY_URL', ok: !!WXPAY.notifyUrl && WXPAY.notifyUrl.startsWith('https://'), hint: '需公网 HTTPS，形如 https://h5.tiaowulan.com/api/pay/notify' }
  ]
  const missing = checks.filter(c => !c.ok).map(c => c.key)
  // subMch 映射抽查（s001；失败不阻断自检）
  let subMchProbe = null
  try { subMchProbe = await resolveSubMch('s001') } catch (e) { subMchProbe = { error: e.message } }
  res.json({
    ready: missing.length === 0,
    missing,
    checks: checks.map(({ key, ok, hint }) => ({ key, ok, hint })),
    notifyUrl: WXPAY.notifyUrl,
    subMchProbe,
    // 分账队列状态：enabled=false 时下单不会打分账标记（资金直接结算给花店）
    profitSharing: {
      enabled: PS.enabled,
      trigger: 'paid',
      delayHours: PS.delayHours,
      scanMinutes: Math.round(PS.scanMs / 60000),
      defaultRatio: PS.defaultRatio,
      adminApi: !!process.env.WXPAY_PS_ADMIN_TOKEN
    }
  })
})

export default router
