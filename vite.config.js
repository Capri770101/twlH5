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
    // 默认借用线上 H5 网关：保留 /agent 前缀，由网关注入平台 Key。
    // 本地直连智能体：设置 AGENT_PROXY_TARGET=http://127.0.0.1:8000
    // 和 AGENT_API_KEY；Key 仅留在开发服务器，不使用 VITE_* 暴露到前端。
    proxy: {
      '/agent': {
        target: process.env.AGENT_PROXY_TARGET || 'http://129.204.85.139',
        changeOrigin: true,
        secure: true,
        rewrite: p => process.env.AGENT_PROXY_TARGET ? p.replace(/^\/agent/, '') : p,
        configure(proxy) {
          const key = process.env.AGENT_API_KEY || ''
          if (!key) return
          proxy.on('proxyReq', proxyReq => proxyReq.setHeader('X-API-Key', key))
        }
      },
      // 默认使用线上业务接口；开发本地后端时设置 API_PROXY_TARGET=http://localhost:4000。
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://129.204.85.139',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    emptyOutDir: false
  }
})
