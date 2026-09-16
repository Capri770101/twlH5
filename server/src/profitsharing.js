// 微信支付「服务商分账」—— 移植自小程序后端既有实现（/opt/flower-shop/server.js）
//
// 流程：
//   支付成功 → markPending() 标记 ps_state=pending（零佣金门店不标记）
//   → 到期（默认 24h）后由扫描任务 shareOrder() 调 /v3/profitsharing/orders
//   → 接收方（服务商自身，收平台服务费）先 receivers/add，报不存在则自动补加后重试
//   → 退款前 ensureReturnedBeforeRefund() 调 /v3/profitsharing/return-orders 回退
//
// 微信官方规则（决定了这里每个判断）：
//   · settle_info.profit_sharing=true 只是把订单标记为「可分账」，微信**不会自动分账**，必须主动调用
//   · 普通服务商分账订单**冻结期默认 30 天**，超期未发起分账 → 资金自动解冻给分账方
//     ⇒ 所以「标记了却不去分账」= 花店的钱被白冻；也所以订单必须真的进入分账队列
//   · 分账**只能按金额**（比例需自行折算金额），单笔分账总额 ≤ 平台设置的「订单分账最大比例」（默认最高 30%）
//   · 接收方必须先 receivers/add，否则报「分账接收方关系不存在」
//   · **分账后退款需接收方（仅商户类型）同意** → 退款前必须先 return-orders
import { hq } from './h5db.js'
import { wxpayRequest, WXPAY } from './wxpay.js'
import { resolveSubMch } from './submch.js'

const ENABLED = String(process.env.WXPAY_PROFITSHARING_ENABLED || '').toLowerCase() === 'true'
const DELAY_HOURS = Math.max(0, Math.floor(Number(process.env.WXPAY_PROFITSHARING_DELAY_HOURS || 24)))
const SCAN_MS = Math.max(60000, Number(process.env.WXPAY_PROFITSHARING_SCAN_MS || 10 * 60 * 1000))
const DEFAULT_RATIO = Number(process.env.WXPAY_PROFITSHARING_RATIO || 10)
// 失败后多久才再试（避免每轮扫描都重试同一笔失败的订单）
const RETRY_MINUTES = Math.max(5, Number(process.env.WXPAY_PROFITSHARING_RETRY_MINUTES || 60))

export const PS = {
  enabled: ENABLED, delayHours: DELAY_HOURS, scanMs: SCAN_MS,
  defaultRatio: DEFAULT_RATIO, retryMinutes: RETRY_MINUTES
}

function normRatio(v, fallback = DEFAULT_RATIO) {
  const r = Number(v)
  return Number.isFinite(r) && r >= 0 && r <= 100 ? r : fallback
}

/** 佣金 = floor(金额 × 比例%)，最低 1 分（0 表示无需分账） */
export function calcCommission(amountFen, ratio) {
  const total = Number(amountFen) || 0
  const r = normRatio(ratio, 0)
  if (total <= 0 || r <= 0) return 0
  return Math.min(total, Math.max(1, Math.floor(total * r / 100)))
}

/** 取该店铺的分账比例（店铺未配置则用 WXPAY_PROFITSHARING_RATIO） */
async function ratioForShop(shopId) {
  try {
    const sub = await resolveSubMch(String(shopId || ''))
    return normRatio(sub.settleRatio, DEFAULT_RATIO)
  } catch (e) {
    return 0
  }
}

/**
 * 支付成功后调用：把订单置为「待分账」。
 * 零佣金门店写 ps_state='none'（永久跳过）；不抛错，不阻塞支付落库。
 */
export async function markPending(orderId) {
  const rows = await hq('SELECT id, shop_id, total_price, ps_state FROM orders WHERE id = ? LIMIT 1', [orderId])
  const o = rows && rows[0]
  if (!o) return { ok: false, message: '订单不存在' }
  if (o.ps_state && o.ps_state !== 'none') return { ok: true, skipped: true }

  const ratio = await ratioForShop(o.shop_id)
  const amount = calcCommission(o.total_price, ratio)
  if (amount <= 0) {
    await hq("UPDATE orders SET ps_state='none', ps_ratio=?, ps_amount=0, ps_updated_at=NOW() WHERE id=?", [ratio, orderId])
    return { ok: true, skipped: true, message: '零佣金门店，不分账' }
  }
  await hq("UPDATE orders SET ps_state='pending', ps_ratio=?, ps_amount=?, ps_message=NULL, ps_updated_at=NOW() WHERE id=?",
    [ratio, amount, orderId])
  console.log('[分账] 已标记待分账：%s 比例=%s%% 佣金=%d分', orderId, ratio, amount)
  return { ok: true, pending: true, ratio, amount }
}

/**
 * 失败处理：**保留 pending**（下一轮扫描会重试），只记原因。
 * 刻意不置为 failed —— 一次网络抖动就永久放弃，会让本该分账的资金在 30 天后才自动解冻。
 */
async function markRetry(orderId, code, message) {
  await hq("UPDATE orders SET ps_state='pending', ps_message=?, ps_updated_at=NOW() WHERE id=?",
    [String(code + ': ' + (message || '')).slice(0, 250), orderId])
  console.warn('[分账] 待重试：%s %s %s', orderId, code, message)
}

/** 添加分账接收方（= 服务商自身，relation_type=SERVICE_PROVIDER） */
async function addReceiver(subMchid) {
  try {
    await wxpayRequest('POST', '/v3/profitsharing/receivers/add', {
      appid: WXPAY.spAppid,
      sub_mchid: subMchid,
      type: 'MERCHANT_ID',
      account: WXPAY.spMchid,
      relation_type: 'SERVICE_PROVIDER'
    })
    console.log('[分账] 已添加分账接收方：sub_mchid=%s', subMchid)
    return true
  } catch (e) {
    // 已存在等业务错误不致命：随后会重试分账请求
    console.warn('[分账] 添加接收方未成功：', String(e.message || e).slice(0, 200))
    return false
  }
}

/** 对单个订单发起分账（force=true 时忽略时间未到，用于真机联调/排障） */
export async function shareOrder(o) {
  const subMchid = o.sub_mchid || (await resolveSubMch(String(o.shop_id || '')).catch(() => null) || {}).subMchid
  if (!subMchid) return markRetry(o.id, 'NO_SUB_MCHID', '未配置子商户号 sub_mchid').then(() => ({ ok: false }))

  const ratio = normRatio(o.ps_ratio, 0)
  const amount = Number(o.ps_amount) || calcCommission(o.total_price, ratio)
  if (amount <= 0) {
    await hq("UPDATE orders SET ps_state='none' WHERE id=?", [o.id])
    return { ok: true, skipped: true }
  }
  if (!WXPAY.spMchid) return markRetry(o.id, 'NO_SP_MCHID', '未配置服务商号').then(() => ({ ok: false }))

  // 1) 拿微信交易号（回调已落库则直接用）
  let transactionId = o.wx_transaction_id || ''
  if (!transactionId) {
    const q = await wxpayRequest('GET',
      `/v3/pay/partner/transactions/out-trade-no/${encodeURIComponent(o.id)}?sp_mchid=${encodeURIComponent(WXPAY.spMchid)}&sub_mchid=${encodeURIComponent(subMchid)}`)
    transactionId = (q && q.transaction_id) || ''
    if (!transactionId) return markRetry(o.id, 'NO_TRANSACTION', '未获取到微信支付交易号').then(() => ({ ok: false }))
    await hq('UPDATE orders SET wx_transaction_id=? WHERE id=?', [transactionId, o.id])
  }

  // 2) 发起分账；接收方关系不存在则自动补加后重试一次
  const body = {
    appid: WXPAY.spAppid,
    sub_mchid: subMchid,
    transaction_id: transactionId,
    out_order_no: 'PS' + o.id,
    receivers: [{
      type: 'MERCHANT_ID',
      account: WXPAY.spMchid,
      amount,
      description: `平台服务费${ratio}%`
    }],
    unfreeze_unsplit: true // 剩余未分账资金立即解冻给子商户（否则要等 30 天）
  }
  let r
  try {
    r = await wxpayRequest('POST', '/v3/profitsharing/orders', body)
  } catch (e) {
    const msg = String(e.message || '')
    if (/RECEIVER_(NOT_EXIST|NOT_FOUND)|接收方.*不存在/i.test(msg)) {
      await addReceiver(subMchid)
      try {
        r = await wxpayRequest('POST', '/v3/profitsharing/orders', body)
      } catch (e2) {
        return markRetry(o.id, 'REQUEST_FAILED', e2.message).then(() => ({ ok: false }))
      }
    } else {
      return markRetry(o.id, 'REQUEST_FAILED', msg).then(() => ({ ok: false }))
    }
  }

  const state = String((r && r.state) || '').toUpperCase()
  if (state === 'FINISHED' || state === 'PROCESSING') {
    const psState = state === 'FINISHED' ? 'success' : 'processing'
    await hq('UPDATE orders SET ps_state=?, ps_order_id=?, ps_message=?, ps_updated_at=NOW() WHERE id=?',
      [psState, (r && r.order_id) || '', (r && r.message) || '', o.id])
    console.log('[分账] 结果：%s state=%s order_id=%s 金额=%d分', o.id, state, (r && r.order_id) || '-', amount)
    return { ok: true, state }
  }
  // 微信受理但状态异常（既非完成也非处理中）
  await markRetry(o.id, 'STATE_' + (state || 'EMPTY'), (r && r.message) || JSON.stringify(r || {}).slice(0, 120))
  return { ok: false, state }
}

/** 强制对某订单分账（忽略"距支付满 N 小时"的限制），用于真机联调 */
export async function forceShare(orderId) {
  const rows = await hq(
    'SELECT id, shop_id, sub_mchid, total_price, wx_transaction_id, ps_ratio, ps_amount, ps_state FROM orders WHERE id=? LIMIT 1',
    [orderId])
  const o = rows && rows[0]
  if (!o) return { ok: false, message: '订单不存在' }
  if (o.ps_state === 'success') return { ok: true, skipped: true, message: '已分账成功' }
  if (!o.ps_state || o.ps_state === 'none') {
    if (!(Number(o.ps_amount) > 0) && !(normRatio(o.ps_ratio, 0) > 0)) await markPending(orderId)
    const again = await hq('SELECT id, shop_id, sub_mchid, total_price, wx_transaction_id, ps_ratio, ps_amount FROM orders WHERE id=? LIMIT 1', [orderId])
    if (!again.length || !(Number(again[0].ps_amount) > 0)) {
      return { ok: false, message: '该订单无需分账（零佣金或未标记）' }
    }
    return shareOrder(again[0])
  }
  return shareOrder(o)
}

/** 轮询 processing 中的分账单，落定最终状态 */
async function pollProcessing() {
  const rows = await hq(
    `SELECT id, sub_mchid, ps_order_id FROM orders
      WHERE ps_state='processing' AND ps_updated_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      ORDER BY ps_updated_at ASC LIMIT 20`)
  for (const o of rows || []) {
    if (!o.sub_mchid) continue
    try {
      const r = await wxpayRequest('GET',
        `/v3/profitsharing/orders/${encodeURIComponent(o.ps_order_id || ('PS' + o.id))}?sub_mchid=${encodeURIComponent(o.sub_mchid)}`)
      const state = String((r && r.state) || '').toUpperCase()
      if (state === 'FINISHED') {
        await hq("UPDATE orders SET ps_state='success', ps_updated_at=NOW() WHERE id=?", [o.id])
        console.log('[分账] 轮询转成功：', o.id)
      }
    } catch (e) { /* 查询失败下次再试 */ }
  }
}

/** 扫描一次：到期未分账的执行分账 + 轮询进行中的分账 */
export async function scanOnce() {
  const rows = await hq(
    `SELECT id, shop_id, sub_mchid, total_price, wx_transaction_id, ps_ratio, ps_amount
       FROM orders
      WHERE ps_state='pending' AND pay_time IS NOT NULL
        AND pay_time <= DATE_SUB(NOW(), INTERVAL ${DELAY_HOURS} HOUR)
        AND (ps_updated_at IS NULL OR ps_updated_at < DATE_SUB(NOW(), INTERVAL ${RETRY_MINUTES} MINUTE))
      ORDER BY pay_time ASC LIMIT 50`)
  let ok = 0, fail = 0
  for (const o of rows || []) {
    try {
      const r = await shareOrder(o)
      if (r.ok) ok++; else fail++
    } catch (e) {
      fail++
      await markRetry(o.id, 'EXCEPTION', e.message)
    }
  }
  if ((rows || []).length) console.log('[分账] 扫描完成：待处理 %d，成功 %d，失败 %d', rows.length, ok, fail)
  await pollProcessing().catch(e => console.warn('[分账] 轮询异常：', e.message))
  return { scanned: (rows || []).length, ok, fail }
}

let _started = false
export function startProfitSharingScanner() {
  if (!ENABLED) {
    console.log('[分账] 未启用（WXPAY_PROFITSHARING_ENABLED != true）→ 下单不会标记分账，资金直接结算给花店')
    return
  }
  if (_started) return
  _started = true
  const tick = () => scanOnce().catch(e => console.warn('[分账] 扫描异常：', e.message))
  const timer = setInterval(tick, SCAN_MS)
  if (timer.unref) timer.unref()
  setTimeout(tick, 10 * 1000)
  console.log('[分账] 已启用：支付成功满 %d 小时分账，每 %d 分钟扫描一次补偿', DELAY_HOURS, Math.round(SCAN_MS / 60000))
}

/**
 * 退款前调用：若该订单已分账，必须先回退分账资金。
 * @returns {Promise<{ok:boolean, skipped?:boolean, message?:string}>}
 */
export async function ensureReturnedBeforeRefund(orderId) {
  const rows = await hq(
    'SELECT id, shop_id, sub_mchid, ps_state, ps_amount, ps_order_id, ps_return_state FROM orders WHERE id=? LIMIT 1',
    [orderId])
  const o = rows && rows[0]
  if (!o) return { ok: true, skipped: true, message: '订单不存在' }
  if (o.ps_return_state === 'success') return { ok: true, skipped: true, message: '分账已回退过' }
  if (!['success', 'processing'].includes(String(o.ps_state))) {
    return { ok: true, skipped: true, message: '该订单未分账，无需回退' }
  }
  const amount = Number(o.ps_amount) || 0
  if (amount <= 0) return { ok: true, skipped: true, message: '分账金额为 0，无需回退' }

  const subMchid = o.sub_mchid || (await resolveSubMch(String(o.shop_id || '')).catch(() => null) || {}).subMchid
  if (!subMchid) return { ok: false, message: '未配置子商户号，无法回退分账' }

  // out_return_no 用确定性值（同一订单只回退一次），失败重试时保持幂等
  const body = {
    sub_mchid: subMchid,
    out_order_no: 'PS' + o.id,
    out_return_no: 'PR' + o.id,
    return_mchid: WXPAY.spMchid,
    amount,
    description: '订单退款分账回退'
  }
  if (o.ps_order_id) body.order_id = o.ps_order_id

  let r
  try {
    r = await wxpayRequest('POST', '/v3/profitsharing/return-orders', body)
  } catch (e) {
    const msg = String(e.message || e)
    await hq("UPDATE orders SET ps_return_state='failed', ps_return_amount=?, ps_return_message=?, ps_return_updated_at=NOW() WHERE id=?",
      [amount, msg.slice(0, 250), o.id])
    console.error('[分账回退] 失败：%s %s', o.id, msg)
    return { ok: false, message: '分账回退失败：' + msg }
  }

  const state = String((r && (r.state || r.result)) || '').toUpperCase()
  if (state === 'PROCESSING') {
    await hq("UPDATE orders SET ps_return_state='processing', ps_return_amount=?, ps_return_message=?, ps_return_updated_at=NOW() WHERE id=?",
      [amount, (r.message || '').slice(0, 250), o.id])
    return { ok: false, message: '分账回退处理中，请稍后再试退款' }
  }
  if (state === 'FINISHED' || state === 'SUCCESS') {
    await hq("UPDATE orders SET ps_return_state='success', ps_return_amount=?, ps_return_message=?, ps_return_updated_at=NOW() WHERE id=?",
      [amount, (r.message || '').slice(0, 250), o.id])
    console.log('[分账回退] 成功：%s 金额=%d分', o.id, amount)
    return { ok: true }
  }
  await hq("UPDATE orders SET ps_return_state='failed', ps_return_amount=?, ps_return_message=?, ps_return_updated_at=NOW() WHERE id=?",
    [amount, String((r && r.message) || '未知状态').slice(0, 250), o.id])
  return { ok: false, message: '分账回退未完成：' + String((r && r.message) || state || '未知') }
}

/** 供自检/排障：取订单的分账状态 */
export async function psStatusForOrder(orderId) {
  const rows = await hq(
    'SELECT id, ps_state, ps_ratio, ps_amount, ps_order_id, ps_message, ps_updated_at, ps_return_state, ps_return_amount FROM orders WHERE id=? LIMIT 1',
    [orderId])
  return (rows && rows[0]) || null
}

/** 统计（自检用）：各分账状态下的订单数 */
export async function psStats() {
  const rows = await hq("SELECT ps_state, COUNT(*) AS cnt FROM orders GROUP BY ps_state")
  const out = {}
  for (const r of rows || []) out[r.ps_state] = Number(r.cnt)
  return out
}

export { addReceiver }
