// 从 AI 自然语言回复里启发式抽取 DIY 方案，合成 diy_plan_card 数据结构
// 背景：智能体平台调了 generate_diy_plan 工具但不 emit card 事件（2026-09-10 实测），
// 前端只能从流式文本里还原结构化方案。等平台按 docs/AI顾问-DIY方案卡-平台需求.md 改完，
// 本文件可停用（Advisor.vue 里已有「平台发过卡就不再提取」的判断）。

// 常见花材词库（用于从文本里扫花材）
const FLOWER_WORDS = [
  '跳舞兰', '香槟玫瑰', '白玫瑰', '红玫瑰', '粉玫瑰', '蓝玫瑰', '卡罗拉红玫瑰',
  '绣球', '玫瑰', '百合', '康乃馨', '向日葵', '郁金香', '洋桔梗', '非洲菊',
  '满天星', '尤加利', '桔梗', '芍药', '牡丹', '马蹄莲', '蝴蝶兰', '薰衣草',
  '勿忘我', '雏菊', '乒乓菊', '情人草', '银叶菊', '红豆', '扶郎', '剑兰',
  '睡莲', '风铃草', '喷泉草', '桉树叶', '小雏菊', '洋牡丹', '奥斯汀', '铁线莲',
  '蕾丝花', '小盼草', '翠珠', '千日红', '麦秆菊', '蓝盆花', '嘉兰百合'
]

// 场景词库
const SCENE_WORDS = [
  '生日', '求婚', '纪念日', '表白', '婚礼', '探病', '道歉', '毕业',
  '母亲节', '情人节', '乔迁', '开业', '升学', '慰问', '感谢', '道歉'
]

function pickName(t) {
  // 「」『』《》【】"" 里的内容，取最长的（一般为方案名）
  const quoted = t.match(/[「『《【"“]([^」』》】"”]{2,24})[」』》】"”]/g) || []
  if (quoted.length) {
    const cand = quoted
      .map(s => s.replace(/^[「『《【"“]|[」』》】"”]$/g, '').trim())
      .filter(s => s && !/^(diy|方案|定制)$/i.test(s))
      .sort((a, b) => b.length - a.length)
    if (cand.length) return cand[0]
  }
  // 兜底：方案名：xxx / 名称：xxx
  const m = t.match(/(?:方案名|方案|名称|主题)[：:]\s*([^\s，,。；;\n]{2,20})/)
  if (m) return m[1].trim()
  return ''
}

function pickPrice(t) {
  let m = t.match(/(?:预算|总价|合计|价格|花费|大概|大约|约)\s*(?:约|大约|大概)?\s*(?:¥|￥)?\s*(\d+(?:\.\d+)?)\s*元/)
  if (m) return normalizePrice(Number(m[1]))
  m = t.match(/(?:¥|￥)\s*(\d+(?:\.\d+)?)/)
  if (m) return normalizePrice(Number(m[1]))
  m = t.match(/(\d+(?:\.\d+)?)\s*元/)
  if (m) return normalizePrice(Number(m[1]))
  return null
}

// 容错：>10000 猜成「分」自动 /100
function normalizePrice(p) {
  if (!Number.isFinite(p)) return null
  return p > 10000 ? p / 100 : p
}

function pickMaterials(t) {
  const out = []
  FLOWER_WORDS.forEach(w => {
    // 该词在文本里的所有出现位置（同一花材可能提到多次，要挑「带数量」的那次）
    const positions = []
    let i = t.indexOf(w)
    while (i >= 0) { positions.push(i); i = t.indexOf(w, i + w.length) }
    if (!positions.length) return

    let qty = null
    let chosen = positions[0]
    positions.forEach(idx => {
      const before = t.slice(Math.max(0, idx - 14), idx)
      const after = t.slice(idx, Math.min(t.length, idx + 16))
      let q = null
      let m = before.match(/(\d+)\s*(?:支|朵|束|扎|枝|个|棵)\s*$/)
      if (m) q = Number(m[1])
      if (q == null) {
        m = before.match(/[×xX]\s*(\d+)\s*$/)
        if (m) q = Number(m[1])
      }
      if (q == null) {
        m = after.match(/^\s*[,，、:：\s]*(\d+)\s*(?:支|朵|束|扎|枝|个)/)
        if (m) q = Number(m[1])
      }
      if (q != null && qty == null) { qty = q; chosen = idx }
    })

    // 单价："粉色绣球 18元/支"
    let unitPrice = null
    const um = t.slice(chosen, Math.min(t.length, chosen + 26)).match(/(\d+(?:\.\d+)?)\s*元\s*\/?\s*(?:支|朵|束|扎|枝)/)
    if (um) unitPrice = Number(um[1])

    // 颜色/修饰前缀：粉色绣球 → "粉色"+"绣球"
    let prefix = ''
    const beforeChosen = t.slice(Math.max(0, chosen - 4), chosen)
    const cm = beforeChosen.match(/([一-龥]{1,2}?)色?\s*$/)
    if (cm && /^(粉|红|白|紫|黄|蓝|绿|橙|香槟|奶油|浅|深)$/.test(cm[1])) prefix = cm[1] + '色'

    // qty=0 表示文本里没写数量（前端显示"适量"，避免假数据）
    out.push({ name: prefix + w, qty: qty || 0, unit: '支', price_yuan: unitPrice })
  })
  // 去重：去掉颜色前缀后比较（避免「红色玫瑰」与「红玫瑰」重复），带数量的优先保留
  const norm = s => String(s).replace(/(粉|红|白|紫|黄|蓝|绿|橙|香槟|奶油|浅|深)色?/, '')
  return out
    .sort((a, b) => (b.qty > 0 ? 1 : 0) - (a.qty > 0 ? 1 : 0) || b.name.length - a.name.length)
    .filter((it, i, arr) => !arr.slice(0, i).some(x => norm(x.name).includes(norm(it.name)) || norm(it.name).includes(norm(x.name))))
    .slice(0, 8)
}

function pickBudget(t) {
  const out = []
  const re = /([^\s，,、。；;：:\d]{1,6}?费)\s*(?:约|大约|大概)?\s*(\d+(?:\.\d+)?)\s*元?/g
  let m
  while ((m = re.exec(t))) {
    // 清洗前缀：「其中花材费」「、人工费」→「花材费」「人工费」
    const label = m[1].trim().replace(/^[其、,，:：中的是]+/, '').trim()
    const amount = Number(m[2])
    if (label && Number.isFinite(amount) && !out.some(b => b.label === label)) {
      out.push({ label, amount_yuan: amount })
    }
  }
  // 兜底：花材费/材料费
  if (!out.length) {
    const m2 = t.match(/(?:花材|材料|主花|配花|包装)[^\d]{0,4}(\d+(?:\.\d+)?)\s*元/)
    if (m2) out.push({ label: '花材', amount_yuan: Number(m2[1]) })
  }
  return out.slice(0, 6)
}

function pickSentence(t, keywords) {
  const re = new RegExp('[^。！!\\n]*(?:' + keywords.join('|') + ')[^。！!\\n]*')
  const m = t.match(re)
  if (!m) return ''
  return m[0].replace(/^[,，、\s]+/, '').trim()
}

export function extractDiyPlan(text) {
  const t = String(text || '')
  if (t.length < 8) return null

  const name = pickName(t)
  const price = pickPrice(t)
  const materials = pickMaterials(t)
  const budget = pickBudget(t)

  // 什么都没抽到 → 认为不是方案，不生成卡片（避免误伤普通对话）
  if (!name && price == null && !materials.length) return null

  let careTips = pickSentence(t, ['养护', '保鲜', '换水', '剪根', '花期', '避免阳光'])
  if (careTips.length > 120) careTips = careTips.slice(0, 120)

  let greeting = pickSentence(t, ['贺卡', '祝福语', '留言', '卡片文案'])
  // 去掉列表序号（「4. 」「3、」「2)」）—— AI 常把贺卡建议写成编号列表的第 N 条
  greeting = greeting.replace(/^\s*\d+\s*[.、)）]\s*/, '')
  // 优先取引号内的原文：AI 一般把真正的文案放在「」/“” 里，
  // 否则会把「贺卡文案我也写好了：」这类引导语一起带进来（用户截图里正是这样）
  const quoted = greeting.match(/[「『“"]([^」』”"]{4,80})[」』”"]/)
  if (quoted) greeting = quoted[1].trim()
  else greeting = greeting.replace(/^[^：:]{0,24}[：:]\s*/, '').trim()
  if (greeting.length > 100) greeting = greeting.slice(0, 100)

  let skillLevel = ''
  if (/新手|零基础|入门|很简单|轻松/.test(t)) skillLevel = '新手'
  else if (/进阶|有一定基础|中等|稍难/.test(t)) skillLevel = '进阶'
  else if (/高阶|复杂|专业|大师|挑战/.test(t)) skillLevel = '高阶'

  const scenes = SCENE_WORDS.filter(s => t.includes(s)).slice(0, 3)

  // 效果图：文本里的图片链接（平台目前不下发，留作兼容）
  const im = t.match(/https?:\/\/[^\s)）"'，,，]+\.(?:jpg|jpeg|png|webp|gif)/i)

  return {
    plan_id: 'diy_' + Date.now(),
    name: name || 'AI 定制花束方案',
    desc: '',
    price: price != null ? price : 0,
    effect_image_url: im ? im[0] : '',
    materials,
    budget,
    skill_level: skillLevel,
    suitable_for: scenes.join(' / '),
    care_tips: careTips,
    greeting_suggestion: greeting
  }
}

// 是否算「DIY 场景」：平台调过相关工具，或用户/AI 文本里有 DIY 意图
export function isDiyScene(text, tools) {
  const ts = (tools || []).map(n => String(n || '').toLowerCase())
  if (ts.some(n => /diy|plan|custom|design/.test(n))) return true
  const t = String(text || '')
  return /DIY|diy|自己搭|自己配|定制|搭配一束|自己.*做|手作/.test(t)
}
