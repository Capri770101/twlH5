// 跳舞兰 H5 生产静态服务（零依赖，CommonJS）
// 用法： PORT=8088 node server.cjs
// 功能：
//   1) 静态托管同目录 dist/（SPA：未知路径 fallback index.html）
//   2) /agent/* 透传到 AGENT_TARGET（与 Vite dev 代理一致，strip /agent 前缀）
//      —— 🔐 平台 X-API-Key 只存在于本服务（环境变量 AGENT_API_KEY），由反代统一注入；
//         前端 bundle 不持有密钥（打包后浏览器可见即等于公开）。
// 注意：监听高位端口，无需 root；正式 HTTPS/80 由 nginx（root）另行配置。

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 8088
const DIST = path.join(__dirname, 'dist')
// 智能体平台地址：走环境变量 —— 便于「智能体单独部署到另一台机器」时只改配置、不改代码。
// 支持 http（智能体在内网时）与 https 两种协议。
const AGENT_TARGET = (process.env.AGENT_TARGET || 'https://49.232.49.176').replace(/\/+$/, '')
const agentClient = new URL(AGENT_TARGET).protocol === 'http:' ? http : https
// 当上游用 IP 访问、但证书仍签发给旧域名时，显式保留 TLS SNI；不关闭证书校验。
const AGENT_TLS_SERVERNAME = process.env.AGENT_TLS_SERVERNAME || ''
const AGENT_HOST_HEADER = process.env.AGENT_HOST_HEADER || ''
// 智能体平台凭证：仅服务端可见（放 /opt/twlh5-h5/.env，由 systemd EnvironmentFile 注入）
// 未配置时不注入该头，便于智能体在内网免鉴权时直接连通。
const AGENT_API_KEY = process.env.AGENT_API_KEY || ''

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json'
}

/**
 * 缓存策略 —— 直接决定「发版后用户要不要手动强刷」。
 * 🔴 这里原本一个缓存头都没有：浏览器于是自行启发式缓存 index.html，
 *    发版后用户仍拿旧入口（指向已被删掉的旧 chunk），页面看着「完全没变化」。
 * 规则：index.html 是入口，必须 no-cache（每次回源验证）；
 *      /assets/ 下的文件名自带内容 hash，改内容必然换名 → 可放心 immutable 长缓存。
 */
function cacheHeaders(urlPath) {
  if (/^\/assets\//.test(urlPath)) {
    return { 'Cache-Control': 'public, max-age=31536000, immutable' }
  }
  return { 'Cache-Control': 'no-cache, must-revalidate' }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  const filePath = path.normalize(path.join(DIST, urlPath))
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    return res.end('forbidden')
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback：一律按 index.html 对待 → no-cache
      const idx = path.join(DIST, 'index.html')
      fs.readFile(idx, (e2, data) => {
        if (e2) {
          res.writeHead(404)
          return res.end('not found')
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'], ...cacheHeaders('/index.html') })
        res.end(data)
      })
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      ...cacheHeaders(urlPath)
    })
    fs.createReadStream(filePath).pipe(res)
  })
}

// ────────────────────────────────────────────────────────────────
// /agent 反代限流（2026-09-18 外部审计 P0-2）
// 🔴 问题：/agent/* 是一条**公开**反代，服务端会替调用方注入平台 Key。
//    实测：无需登录、无任何凭证，POST /agent/auth/token 即可换到 30 天令牌，
//    随后可无限调用 /chat/stream（含生图）——烧的是我们的模型与生图费用。
//    前端 bundle 里残留的 Key 只是"次要"问题，**真正的入口是这条反代**。
// 这里做的是**滥用闸门**（不是鉴权）：
//    ① 按 IP 滑窗限流（token 与 chat 分开计）
//    ② 全局并发上限（对话/生图很吃上游）
//    ③ 全局日配额兜底（防分布式刷）
// 若要彻底关闭匿名可用，需产品层面改为「必须登录 H5 才转发 /agent/*」。
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d }
const RL = {
  tokenPerHour: num(process.env.AGENT_RL_TOKEN_PER_HOUR, 120),
  chatPerHour: num(process.env.AGENT_RL_CHAT_PER_HOUR, 60),
  dailyTotal: num(process.env.AGENT_RL_DAILY_TOTAL, 3000),
  maxConcurrent: num(process.env.AGENT_RL_MAX_CONCURRENT, 6)
}
const HOUR = 3600 * 1000
const rlBuckets = new Map()   // ip -> { token: [ts], chat: [ts] }
let agentInFlight = 0
let agentDay = { day: '', count: 0 }

function clientIp(req) {
  // nginx 在前面，真实 IP 看 X-Forwarded-For 的第一跳
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return xff || (req.socket && req.socket.remoteAddress) || 'unknown'
}

/**
 * 只有**真正花钱**的请求才计数。
 * 🔴 第一版把 `^/agent/(chat|tasks)` 一起算进 chat 桶，结果**效果图轮询（每 3.5s 一次 /tasks/{id}）
 *    几十秒就把 60/小时的额度打满** → 正常用户直接 429 → 前端回退「演示模式」。
 *    轮询是廉价 GET、不触发模型，不在这里限流。
 */
function bucketOf(url) {
  if (url.startsWith('/agent/auth/token')) return 'token'
  if (url.startsWith('/agent/chat/') || url === '/agent/chat') return 'chat'
  return null // /tasks/*、/conversations*、/ui-contract 等：不计流
}

function rlHit(ip, kind) {
  const now = Date.now()
  let b = rlBuckets.get(ip)
  if (!b) { b = { token: [], chat: [] }; rlBuckets.set(ip, b) }
  const arr = b[kind] || (b[kind] = [])
  while (arr.length && now - arr[0] > HOUR) arr.shift()
  const limit = kind === 'token' ? RL.tokenPerHour : RL.chatPerHour
  if (arr.length >= limit) return false
  arr.push(now)
  return true
}
function rlSweep() {
  const now = Date.now()
  for (const [ip, b] of rlBuckets) {
    for (const k of ['token', 'chat']) {
      if (b[k]) b[k] = b[k].filter(t => now - t <= HOUR)
    }
    if (!b.token.length && !b.chat.length) rlBuckets.delete(ip)
  }
}
setInterval(rlSweep, 10 * 60 * 1000).unref()

function proxyAgent(req, res) {
  const ip = clientIp(req)
  const bucket = bucketOf(req.url)
  if (bucket === 'token' && !rlHit(ip, 'token')) {
    return tooMany(res, '请求过于频繁，请稍后再试')
  }
  if (bucket === 'chat') {
    if (!rlHit(ip, 'chat')) return tooMany(res, '对话请求过于频繁，请稍后再试')
    if (agentInFlight >= RL.maxConcurrent) return tooMany(res, '当前咨询较多，请稍后再试')
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
    if (agentDay.day !== today) agentDay = { day: today, count: 0 }
    if (agentDay.count >= RL.dailyTotal) return tooMany(res, '今日服务繁忙，请稍后再试')
    agentDay.count++
    agentInFlight++
    res.on('close', () => { agentInFlight = Math.max(0, agentInFlight - 1) })
  }
  const targetPath = req.url.replace(/^\/agent/, '') || '/'
  const targetUrl = new URL(targetPath, AGENT_TARGET)
  const headers = { ...req.headers, host: AGENT_HOST_HEADER || targetUrl.host }
  // 🔐 一律以服务端凭证为准：有则覆盖（并丢弃前端可能带来的伪造值），无则删除
  if (AGENT_API_KEY) headers['x-api-key'] = AGENT_API_KEY
  else delete headers['x-api-key']
  const options = { method: req.method, headers }
  if (AGENT_TLS_SERVERNAME && agentClient === https) options.servername = AGENT_TLS_SERVERNAME
  const upstream = agentClient.request(targetUrl, options, (upRes) => {
    // SSE / 长连接：显式告知反代层不要缓冲（nginx 需配 proxy_buffering off 双保险）
    res.setHeader('X-Accel-Buffering', 'no')
    res.writeHead(upRes.statusCode, upRes.headers)
    upRes.pipe(res)
  })
  upstream.on('error', (e) => {
    console.error('[agent-proxy] error:', e.message)
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('agent upstream error')
  })
  req.pipe(upstream)
}

function tooMany(res, msg) {
  res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' })
  res.end(JSON.stringify({ detail: msg }))
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/agent')) return proxyAgent(req, res)
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res)
  res.writeHead(405)
  res.end('method not allowed')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('[twlH5] serving dist/ on http://0.0.0.0:' + PORT + '  (agent proxy -> ' + AGENT_TARGET + ')')
})
