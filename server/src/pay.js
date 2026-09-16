// 微信支付「服务商模式」支付路由：下单(JSAPI/H5) / 查询 / 关单 / 退款 / 回调
// 复用跳舞兰服务商号 + 各花店 sub_mchid。
//
// 分账（profit_sharing）说明：
//   settle_info.profit_sharing=true 只是把订单标记为「可分账」，资金随即进入分账冻结
//   （普通服务商分账默认冻结 30 天，超期未发起分账会自动解冻给分账方）。
//   因此**只在该店确实有佣金时**才标记 —— 否则零佣金门店的钱会被无谓冻结。
//   ⚠️ 主动发起分账尚未实现（见 onPaid 里的说明），标记了却不去分账 = 资金白冻结。
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { wxpayRequest, decryptResource, verifyNotify, buildJsapiPayParams, WXPAY, WX_API_BASE } from './wxpay.js'
import { query } from './db.js'
import { hq, withTx } from './h5db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = express.Router()

// ---------- sub_mchid 解析（shopId -> 子商户） ----------
// 优先级：① server/config/submch.json（便于暂无 DB 时配置）② shops 表 sub_mchid 列
let _submchCache = null
function loadSubmchConfig() {
  if (_submchCache) return _submchCache
  // 以「src/..」即 server 目录为基准（本地 server/ 与线上 /opt/twlh5-server 两种布局均成立）
  const p = path.join(__dirname, '..', 'config', 'submch.json')
  try {
    _submchCache = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    _submchCache = {}
  }
  return _submchCache
}

export async function resolveSubMch(shopId) {
  const cfg = loadSubmchConfig()
  if (cfg[shopId]) {
    const m = cfg[shopId]
    return { subMchid: m.subMchid, subAppid: m.subAppid || WXPAY.spAppid, settleRatio: m.settleRatio || 0 }
  }
  // 回退：读 shops 表（需 DB 可达）
  try {
    const rows = await query('SELECT sub_mchid, sub_appid, settle_ratio FROM `shops` WHERE id = ?', [shopId])
    if (rows[0] && rows[0].sub_mchid) {
      return {
        subMchid: rows[0].sub_mchid,
        subAppid: rows[0].sub_appid || WXPAY.spAppid,
        settleRatio: Number(rows[0].settle_ratio) || 0
      }
    }
  } catch (e) { /* DB 不可达则忽略，下面报错 */ }
  throw new Error('未找到 shopId=' + shopId + ' 的子商户号 sub_mchid（请配置 server/config/submch.json 或 shops.sub_mchid）')
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
      sub_appid: sub.subAppid,
      sub_mchid: sub.subMchid,
      description: String(description || '跳舞兰AI花店订单').slice(0, 127),
      out_trade_no: String(outTradeNo),
      notify_url: WXPAY.notifyUrl,
      amount: { total: dbAmount, currency: 'CNY' }
    }
    // 仅当该店佣金 > 0 才标记需要分账（与小程序的规则一致）。
    // 微信分账只能按金额、不能按比例，比例要自己算好金额后传（此处仅预判是否需分账）。
    const settleRatio = Number(sub.settleRatio) || 0
    const commission = Math.floor(dbAmount * settleRatio / 100)
    if (commission > 0) body.settle_info = { profit_sharing: true }
    console.log('[pay] 下单 out_trade_no=%s shop=%s 金额=%d分 佣金比例=%s%% 佣金=%d分 标记分账=%s',
      body.out_trade_no, ord.shop_id || shopId, dbAmount, settleRatio, commission, commission > 0 ? '是' : '否')
    if (tradeType === 'JSAPI') {
      if (!openid) return res.status(400).json({ error: 'JSAPI 需要 openid' })
      body.payer = { sp_openid: openid }
    } else {
      body.scene_info = {
        h5_info: {
          type: 'Wap',
          app_name: '跳舞兰AI花店',
          app_url: WXPAY.h5RedirectUrl || 'https://tiaowulan.com'
        }
      }
    }
    const apiPath = tradeType === 'H5'
      ? '/v3/pay/partner/transactions/h5'
      : '/v3/pay/partner/transactions/jsapi'
    const r = await wxpayRequest('POST', apiPath, body)
    if (tradeType === 'H5') {
      let h5Url = r.h5_url
      if (WXPAY.h5RedirectUrl) {
        h5Url += (h5Url.includes('?') ? '&' : '?') + 'redirect_url=' + encodeURIComponent(WXPAY.h5RedirectUrl)
      }
      return res.json({ tradeType: 'H5', h5_url: h5Url })
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
    const r = await wxpayRequest('GET', `/v3/pay/partner/transactions/out-trade-no/${encodeURIComponent(req.params.outTradeNo)}?sub_mchid=${encodeURIComponent(subMchid)}`)
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
    await wxpayRequest('POST', `/v3/pay/partner/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`, { sub_mchid: sub })
    return res.json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
  }
})

// ---------- 退款（服务商） ----------
router.post('/refund', async (req, res) => {
  try {
    const { outTradeNo, reason, amountFen, shopId, subMchid } = req.body
    const sub = subMchid || (shopId ? (await resolveSubMch(shopId)).subMchid : null)
    if (!sub || !outTradeNo) return res.status(400).json({ error: 'missing outTradeNo/subMchid' })
    const body = {
      sub_mchid: sub,
      out_trade_no: String(outTradeNo),
      out_refund_no: 'R' + Date.now(),
      reason: String(reason || '用户申请退款').slice(0, 80),
      amount: { refund: Math.round(Number(amountFen)), total: Math.round(Number(amountFen)), currency: 'CNY' }
    }
    const r = await wxpayRequest('POST', '/v3/refund/domestic/refunds', body)
    return res.json(r)
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) })
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
async function onPaid(outTradeNo, transactionId, decrypted) {
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
    const channel = decrypted && decrypted.payer ? 'jsapi' : 'h5'
    await conn.query(
      `INSERT INTO payments (order_id, out_trade_no, transaction_id, channel, amount, status, sub_mchid, raw_callback)
       VALUES (?, ?, ?, ?, ?, 'success', ?, ?)`,
      [outTradeNo, outTradeNo, transactionId, channel, amount, o.sub_mchid,
        JSON.stringify(decrypted || {})]
    )
  })
  console.log('[pay] 支付成功已落库：', outTradeNo, transactionId)
  // ⚠️ 主动分账（/v3/profitsharing/orders）尚未实现 —— 原有一个 WXPAY_TRIGGER_PROFITSHARING
  //    开关下的桩实现已移除，原因是它实际不可能正确执行：
  //      ① shopId 从订单号里 split('_') 猜（订单号是 T+时间戳+随机数，没有下划线）→ 必然取不到子商户
  //      ② receivers 把佣金分给子商户自己且 amount=0 → 等于没分
  //      ③ 缺 unfreeze_unsplit / 接收方自愈(receivers/add) / 退款前回退(return-orders) / 延迟调度
  //    保留那个开关只会让人误以为「打开就能分账」。待移植小程序那套完整逻辑后再上线。
}

/**
 * 说明：微信服务商分账需要主动调用接口，不是「配置了就会自动分」。
 * 完整实现应包含（参照 /opt/flower-shop/server.js 的既有实现）：
 *   1) 佣金 = floor(订单金额 × 该店 settleRatio%)，>0 才需要分账
 *   2) 延迟触发（小程序为订单完成后 24h）+ 每 10 分钟扫描补偿，防进程重启丢任务
 *   3) POST /v3/profitsharing/orders，receivers 指向服务商自身，带 unfreeze_unsplit 解冻余款
 *   4) 报 RECEIVER_NOT_EXIST → POST /v3/profitsharing/receivers/add 后重试（自愈）
 *   5) 退款前先 POST /v3/profitsharing/return-orders 回退已分账资金
 */

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
    subMchProbe
  })
})

export default router
