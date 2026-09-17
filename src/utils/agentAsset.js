// 智能体平台资源地址归一化 —— 纯函数（无副作用、无环境依赖，便于单测）
//
// 背景：平台返回的资源地址是**相对路径**（如 `/generated/<task_id>.png`、`/tasks/xxx`），
// 必须补上反代前缀才能给 <img> 用。
//
// 🔴 铁律：这个函数**必须幂等**。
//    它会在多处被调用（`pollAgentTask` 内部先归一化一次，调用方拿到结果后往往再归一化一次），
//    不幂等就会拼成 `/agent/agent/generated/xxx.png` → 404 → 卡片显示「效果图加载失败」。
//    （实测：服务端 `/agent/generated/<task>.png` 本身就是 200 image/png，纯属前端拼错。）
export function normalizeAgentAssetUrl(u, base = '') {
  const s = String(u || '').trim()
  if (!s) return ''
  // 已是绝对地址或 dataURL → 原样返回
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s

  let t = s
  // 兼容历史数据：早期版本不幂等，可能已经把 `/agent/agent/...` 存进了 localStorage，
  // 这里把重复前缀折叠回单层，让老消息也能重新显示（数据不必重存）。
  if (base) {
    const dup = base + base
    while (t === dup || t.startsWith(dup + '/')) t = base + t.slice(dup.length)
  }
  // 已带前缀 → 原样返回（幂等的关键）
  if (base && (t === base || t.startsWith(base + '/'))) return t
  return base + (t.startsWith('/') ? t : '/' + t)
}
