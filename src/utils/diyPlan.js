// DIY 方案解析 —— 纯函数，便于单测（组件只管渲染）。
//
// 背景：平台的 plan_card.plans 里混了两类数据，用 `diy` 标志区分：
//   · 现成商品：id = f_xxx、有 image、price 为数字、带 shop_id
//   · DIY 方案：diy = true、plan_id = DIY_xxx、**没有 image**（效果图靠 task_id 轮询生成）、
//              价格是 estimated_price（字符串，如「约 200 元（轻送礼档）」）
// 🔴 旧实现把 DIY 也当商品渲染 → 无图、价格显示成「¥到店咨询」、点结算找不到商品。
//
// 🔴 另一个坑：旧实现读的是 materials / budget / greeting_suggestion / price ——
//    这些字段在平台的 DIY 数据里**都不存在**（真实字段见下方注释），于是只能回退到
//    utils/extractDiyPlan 从正文文本里猜，细节大量丢失（用户反馈「DIY 方案不具体」）。

/** 色名 → 色值（对齐官方 demo 的 COLORS 表） */
export const DIY_COLORS = {
  红: '#C81E27', 正红: '#C81E27', 暖红: '#D94F48', 酒红: '#7B2D3B', 粉: '#F4A7BB', 浅粉: '#F9CDDB',
  复古粉: '#D98C9B', 灰粉: '#C9A3A8', 珊瑚粉: '#F08A79', 粉白: '#F7DEE7', 白: '#FBFBF8', 奶白: '#F7F3E6',
  米白: '#F3EBDD', 香槟: '#F0DCC0', 暖奶油: '#F5E6C8', 燕麦: '#E2D3B8', 焦糖: '#B5793F', 黄: '#F2C94C',
  亮黄: '#FFD23F', 蜡黄: '#E8D05A', 橙: '#F2994A', 暖橙: '#F5A65B', 金: '#C9A227', 紫: '#8E7CC3',
  浅紫: '#C6B7E0', 豆沙: '#B0746E', 蓝: '#5B8DBE', 浅蓝: '#A9CBEA', 天蓝: '#84C2E8', 灰蓝: '#8FA3B8',
  雾蓝: '#A9BCCD', 绿: '#7BA05B', 浅绿: '#BCD8A6', 墨绿: '#2F4F3E', 橄榄绿: '#8A9A5B', 银灰: '#C3C8CD',
  黑: '#2B2B2B', 灰绿: '#9AAE9B', 单色: '#E8E4DC', 灰调: '#B9B4AC', 多彩混合: '#E4A0B7'
}
/**
 * 色名 → 色值。
 * ⚠️ 平台给的是「粉色」「浅紫色」这类**带后缀**的名字，而色表的键是「粉」「浅紫」，
 *    精确匹配会落空 → 色块显示成灰兜底（实测平台 color_scheme = ['粉色','浅紫','雾蓝','绿']，
 *    其中「粉色」就匹配不到）。故补一层双向包含匹配，**长键优先**（否则「浅粉」会被「粉」抢先）。
 */
export const hexOfColor = (n) => {
  const s = String(n || '').trim()
  if (!s) return '#D8D2C6'
  if (DIY_COLORS[s]) return DIY_COLORS[s]
  const keys = Object.keys(DIY_COLORS).sort((a, b) => b.length - a.length)
  const hit = keys.find((k) => s.includes(k)) || keys.find((k) => k.includes(s))
  return hit ? DIY_COLORS[hit] : '#D8D2C6'
}

const arr = (v) => (Array.isArray(v) ? v : [])

function normFlower(x, fallbackRole) {
  const lang = Array.isArray(x.flower_language)
    ? x.flower_language.join(' · ')
    : (x.flower_language || '')
  return {
    name: x.name || '花材',
    role: x.role || fallbackRole || '',
    qty: Number(x.qty != null ? x.qty : 0) || 0,
    unit: x.unit || '支',
    unitPrice: Number(x.unit_price != null ? x.unit_price : 0) || 0,
    // 兜底结构（extractDiyPlan）没有花语，退而显示它的单价文案
    language: lang || x.subText || '',
    inShop: x.in_shop
  }
}

/**
 * 把平台的 DIY plan（或前端兜底结构）归一化成卡片渲染数据。
 * @param {object} raw 平台 plan_card.plans[i]（diy:true）或 diy_plan_card 的 data
 * @param {object} top 外层 card.data（平台的 task_id / poll 挂在 plan_card 顶层）
 */
export function normalizeDiyPlan(raw, top = {}) {
  const p = (raw && typeof raw === 'object') ? raw : {}
  const d = (p.design && typeof p.design === 'object') ? p.design : {}
  const t = (top && typeof top === 'object') ? top : {}

  // ── 花材：平台 design.main_flowers / fillers / foliage；兜底结构在顶层 materials
  const legacyMaterials = arr(p.materials)
  const designMain = arr(d.main_flowers)
  const mainFlowers = designMain.length
    ? designMain.map((x) => normFlower(x, '主花'))
    : legacyMaterials.map((x) => normFlower(x, '主花'))

  const fillers = arr(d.fillers).map((x) => normFlower(x, '配花'))
  const foliage = arr(d.foliage).map((x) => normFlower(x, '叶材'))
  const nm = (f) => (f.inShop === false ? f.name + '（该店暂无）' : f.name) + '×' + f.qty
  const segs = []
  if (fillers.length) segs.push(fillers.map(nm).join('、'))
  if (foliage.length) segs.push(foliage.map(nm).join('、'))

  // ── 预算：平台 budget_breakdown.items / total_estimate；兜底结构在顶层 budget
  const bd = (p.budget_breakdown && typeof p.budget_breakdown === 'object') ? p.budget_breakdown : {}
  const bdItems = arr(bd.items)
  const budgetRows = bdItems.length
    ? bdItems.map((b) => ({
        label: b.item || '其他',
        detail: b.detail || '',
        amount: Number(b.amount != null ? b.amount : 0) || 0
      }))
    : arr(p.budget).map((b) => ({
        label: b.label || '其他',
        detail: '',
        amount: Number(b.amount != null ? b.amount : 0) || 0
      }))

  const bdTotal = Number(bd.total_estimate)
  const rowSum = budgetRows.reduce((s, b) => s + b.amount, 0)
  const legacyPrice = Number(p.price)
  const totalNum = (Number.isFinite(bdTotal) && bdTotal > 0)
    ? bdTotal
    : (rowSum || ((Number.isFinite(legacyPrice) && legacyPrice > 0) ? legacyPrice : 0))

  // ── 难度 / 适用人群（平台在 design 下，兜底结构在顶层）
  const skillLevel = d.difficulty || p.skill_level || ''
  const suitableFor = Array.isArray(d.suitable_for)
    ? d.suitable_for.join('、')
    : (d.suitable_for || p.suitable_for || '')

  // ── 费用说明
  const f = (d.fees && typeof d.fees === 'object') ? d.fees : {}
  const bf = (bd.fees && typeof bd.fees === 'object') ? bd.fees : {}
  const labor = f.labor_fee != null ? f.labor_fee : bf.labor
  const decor = f.decor_fee != null ? f.decor_fee : bf.decor
  const feeParts = []
  if (labor != null) feeParts.push('人工费 ' + labor + ' 元')
  if (decor != null) feeParts.push('装饰费 ' + decor + ' 元')
  const feeNote = [feeParts.join('，'), f.note || bf.note || ''].filter(Boolean).join('　')

  // ── 价格文案：平台给的是字符串（「约 200 元（轻送礼档）」），**直接用，不要在前面拼 ¥**
  const est = String(p.estimated_price || '').trim()
  const priceText = est
    || (totalNum ? '约 ¥' + totalNum.toFixed(0)
      : (Number(p.budget_num) ? '约 ¥' + Number(p.budget_num) : '价格以门店确认为准'))

  // ── 效果图
  const coverImage = p.effect_image_url || p.image_url || t.effect_image_url || ''
  const hasTask = !!(p.task_id || p.poll || t.task_id || t.poll)

  // ── 标签
  const chips = []
  if (p.occasion) chips.push({ text: p.occasion })
  if (p.recipient) chips.push({ text: '送' + p.recipient })
  if (p.style) chips.push({ text: p.style })
  if (skillLevel) chips.push({ text: '难度 ' + skillLevel })
  if (d.est_time) chips.push({ text: '约 ' + d.est_time + ' 分钟' })
  if (d.shelf_life) chips.push({ text: '花期 ' + d.shelf_life })
  if (p.budget_tier) chips.push({ text: p.budget_tier + '档', brass: true })

  const steps = arr(p.diy_steps).length ? arr(p.diy_steps) : arr(d.diy_steps)

  return {
    id: String(p.plan_id || p.id || 'diy'),
    name: p.name || '定制方案',
    desc: p.desc || '',
    coverImage,
    hasTask,
    priceText,
    priceNum: totalNum,
    mainFlowers,
    secRow: segs.join('；'),
    unavailable: arr(p.unavailable_materials),
    colorScheme: arr(d.color_scheme).length ? arr(d.color_scheme) : arr(p.color_scheme),
    packaging: d.packaging || p.packaging || '',
    meaning: d.meaning || p.meaning || '',
    steps,
    careTips: d.care_tips || p.care_tips || '',
    caution: d.caution || p.caution || '',
    greeting: d.card_message || p.card_message || p.greeting || p.greeting_suggestion || '',
    skillLevel,
    suitableFor,
    budgetRows,
    totalNum,
    feeNote,
    stemCount: f.stem_count || bf.stem_count || '',
    chips
  }
}
