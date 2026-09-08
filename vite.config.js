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
    port: 5180
  }
})
