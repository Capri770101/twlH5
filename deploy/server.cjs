// 跳舞兰 H5 生产静态服务（零依赖，CommonJS）
// 用法： PORT=8088 node server.cjs
// 功能：
//   1) 静态托管同目录 dist/（SPA：未知路径 fallback index.html）
//   2) /agent/* 透传到 https://api.tiaowulan.com/*（与 Vite dev 代理一致，strip /agent 前缀）
//      —— X-API-Key 由前端 bundle 同源带入，本服务只做转发，不在服务端存 key
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
      // SPA fallback
      const idx = path.join(DIST, 'index.html')
      fs.readFile(idx, (e2, data) => {
        if (e2) {
          res.writeHead(404)
          return res.end('not found')
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] })
        res.end(data)
      })
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    fs.createReadStream(filePath).pipe(res)
  })
}

function proxyAgent(req, res) {
  const targetPath = req.url.replace(/^\/agent/, '') || '/'
  const targetUrl = new URL(targetPath, AGENT_TARGET)
  const options = {
    method: req.method,
    headers: { ...req.headers, host: targetUrl.host }
  }
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
