import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const stylesDir = fileURLToPath(new URL('./src/styles', import.meta.url)).replace(/\\/g, '/')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "${stylesDir}/rpx" as *;`
      }
    }
  },
  server: {
    port: 5180,
    // 开发代理：H5 走同源 /agent/* 由 Vite 转发到 api.tiaowulan.com（绕开浏览器 CORS）
    // 🔐 X-API-Key 由本代理注入，取自 shell 环境变量 AGENT_API_KEY ——
    //    刻意不用 VITE_* 前缀（那个会被打进前端 bundle，等于公开密钥）。
    //    本地联调：AGENT_API_KEY=xxx npm run dev
    proxy: {
      '/agent': {
        target: 'https://api.tiaowulan.com',
        changeOrigin: true,
        secure: true,
        rewrite: p => p.replace(/^\/agent/, ''),
        configure(proxy) {
          const key = process.env.AGENT_API_KEY || ''
          if (!key) return
          proxy.on('proxyReq', proxyReq => proxyReq.setHeader('X-API-Key', key))
        }
      },
      // 本地 Node 后端（MySQL 只读库代理）：/api/* 转发到 http://localhost:4000
      // 生产可由同源反向代理或把后端部署到同源路径下，避免浏览器跨域
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    emptyOutDir: false
  }
})
