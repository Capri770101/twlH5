/**
 * AI 顾问 —— 会话历史的合并与落盘瘦身（纯函数，便于单测）
 *
 * 背景（2026-09-17 修复「刷新一下商品卡片就没了」）：
 *   智能体平台**只存文本**，商品卡 / DIY 方案卡 / 选项都拿不回来。
 *   而登录后会把平台历史拉回来合并；原先的实现是
 *     exist.messages = [{GREETING}, ...平台消息]
 *   —— 直接整体覆盖本地消息，卡片全丢；紧接着又 saveConversations() 把
 *   这个已丢卡片的版本写回 localStorage，连本地兜底也一起没了。
 *   现在改为「本地优先、只补平台独有的」，并且落盘前做瘦身（防超配额）。
 */

/** 消息指纹：用「角色 + 文本前 64 字」对齐本地与平台历史 */
export function msgFingerprint(m) {
  const role = String((m && m.role) || '')
  const text = String((m && (m.text || m.reply)) || '').trim().slice(0, 64)
  return role + '|' + text
}

/**
 * 合并平台历史与本地消息 —— **本地优先，只补平台独有的**。
 * 用计数而非 Set：同一会话里出现重复文本（例如两次「你好」）也能正确对齐。
 * @returns {{messages: Array, appended: number}} appended = 从平台补进来的条数
 */
export function mergeAgentMessages(localMsgs, remoteMsgs) {
  const local = (Array.isArray(localMsgs) ? localMsgs : []).filter(m => m && !m.greeting)
  const remote = (Array.isArray(remoteMsgs) ? remoteMsgs : []).filter(m => m && !m.greeting)

  const budget = new Map()
  for (const m of local) {
    const k = msgFingerprint(m)
    budget.set(k, (budget.get(k) || 0) + 1)
  }

  const out = local.slice() // 本地版本带着卡片 → 优先保留
  let appended = 0
  for (const rm of remote) {
    const k = msgFingerprint(rm)
    const left = budget.get(k) || 0
    if (left > 0) { budget.set(k, left - 1); continue } // 本地已有对应消息 → 跳过
    out.push({ ...rm, cards: Array.isArray(rm.cards) ? rm.cards : [] })
    appended++
  }
  return { messages: out, appended }
}

/**
 * 落盘前瘦身。⚠️ localStorage 有 ~5MB 配额，**一旦超了就整份写不进去**（且是静默失败），
 * 现象就是「刷新后卡片全没了」。宁可丢大字段，也要保住文本与卡片骨架。
 */
export function slimValue(v, depth = 0) {
  if (depth > 3) return null
  if (typeof v === 'string') return v.length > 1500 ? '' : v
  if (Array.isArray(v)) return v.slice(0, 12).map(x => slimValue(x, depth + 1))
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v)) o[k] = slimValue(v[k], depth + 1)
    return o
  }
  return v
}

/**
 * 从助手正文里捞效果图任务编号（兜底用）。
 * 平台有时**不下发 image_task 卡片**，只在正文里报一句
 * 「效果图任务已经提交（编号 bd51f44545714042）」—— 前端因此无从轮询，效果图永远出不来。
 * 平台正常下发卡片后，这段天然不会再命中。
 */
const IMG_TASK_RE = /(?:编号|任务号|task[_ ]?id)[\s:：=]*([0-9a-fA-F]{12,40})/i

export function extractImageTaskId(text) {
  const m = String(text || '').match(IMG_TASK_RE)
  return m ? m[1] : ''
}

export function slimMessage(m) {
  const out = { ...(m || {}) }
  // base64 效果图很占地方，不落盘；但**结果图 URL 要留**（平台返回的 result_url 是短地址）
  if (typeof out.image === 'string' && out.image.length > 2000) out.image = ''
  // ⚠️ poll 是**相对路径字符串**（/tasks/xxx），必须保留：
  //    刷新后要接着把「已提交但还没出图」的效果图任务轮询下去，否则图永远出不来。
  //    只有非字符串（异常值）才清掉。
  if (out.poll && typeof out.poll !== 'string') out.poll = null
  // 运行时防重标记不能落盘（否则刷新后会被当成"已在轮询中"而不再启动）
  delete out._imagePolling
  if (Array.isArray(out.cards)) {
    out.cards = out.cards.slice(0, 8).map(c => ({ ui: c && c.ui, data: slimValue(c && c.data) }))
  }
  for (const k of ['products', 'options']) {
    if (Array.isArray(out[k])) out[k] = out[k].slice(0, 12).map(x => slimValue(x))
  }
  if (Array.isArray(out.plans)) out.plans = out.plans.slice(0, 8).map(x => slimValue(x))
  return out
}
