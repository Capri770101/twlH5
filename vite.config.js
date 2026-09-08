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
    // 开发代理：H5 走同源 /agent/* 由 Vite 转发到 api.tiaowulan.com
    // 绕开浏览器 CORS，且 X-API-Key 来自前端（import.meta.env.VITE_AGENT_API_KEY）
    proxy: {
      '/agent': {
        target: 'https://api.tiaowulan.com',
        changeOrigin: true,
        secure: true,
        rewrite: p => p.replace(/^\/agent/, '')
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
