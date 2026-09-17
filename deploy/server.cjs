// 跳舞兰 H5 生产静态服务（零依赖，CommonJS）
// 用法： PORT=8088 node server.cjs
// 功能：
//   1) 静态托管同目录 dist/（SPA：未知路径 fallback index.html）
//   2) /agent/* 透传到 https://api.tiaowulan.com/*（与 Vite dev 代理一致，strip /agent 前缀）
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
const AGENT_TARGET = (process.env.AGENT_TARGET || 'https://api.tiaowulan.com').replace(/\/+$/, '')
const agentClient = new URL(AGENT_TARGET).protocol === 'http:' ? http : https
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

function proxyAgent(req, res) {
  const targetPath = req.url.replace(/^\/agent/, '') || '/'
  const targetUrl = new URL(targetPath, AGENT_TARGET)
  const headers = { ...req.headers, host: targetUrl.host }
  // 🔐 一律以服务端凭证为准：有则覆盖（并丢弃前端可能带来的伪造值），无则删除
  if (AGENT_API_KEY) headers['x-api-key'] = AGENT_API_KEY
  else delete headers['x-api-key']
  const options = { method: req.method, headers }
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

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/agent')) return proxyAgent(req, res)
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res)
  res.writeHead(405)
  res.end('method not allowed')
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('[twlH5] serving dist/ on http://0.0.0.0:' + PORT + '  (agent proxy -> ' + AGENT_TARGET + ')')
})
