<template>
  <div class="poster-mask" @click.self="$emit('close')">
    <div class="poster-wrap">
      <div class="poster-title">分享海报</div>
      <canvas ref="canvas" class="poster-canvas"></canvas>
      <div class="poster-tip">长按上方图片保存，分享给好友或朋友圈</div>
      <div class="poster-actions">
        <button class="pa-btn" @click="copyLink">复制商品链接</button>
        <button class="pa-btn pa-primary" @click="$emit('close')">完成</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { money } from '@/store'

const props = defineProps({
  product: { type: Object, required: true }
})
defineEmits(['close'])

const canvas = ref(null)
const shareUrl = `https://h5.tiaowulan.com/detail/${props.product.id}`

// 二维码图（生成成功才绘制）
let qrImg = null

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function draw() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  const W = 600
  const H = 960
  c.width = W
  c.height = H

  // 背景渐变
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#ff7a6b')
  g.addColorStop(1, '#ffd9d2')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 白色内容卡
  const pad = 40
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, pad, 120, W - pad * 2, 600, 28)
  ctx.fill()

  ctx.textAlign = 'center'

  // 顶部大花 emoji
  ctx.font = '120px serif'
  ctx.fillText('🌸', W / 2, 300)

  // 商品标题
  ctx.fillStyle = '#251f1c'
  ctx.font = 'bold 38px sans-serif'
  const name = (props.product.name || '精选花束').slice(0, 13)
  ctx.fillText(name, W / 2, 410)

  // 价格
  ctx.fillStyle = '#e8615d'
  ctx.font = 'bold 60px sans-serif'
  ctx.fillText('¥' + money(props.product.price), W / 2, 490)

  // 店铺
  ctx.fillStyle = '#8a7d74'
  ctx.font = '26px sans-serif'
  ctx.fillText(props.product.shopName || '跳舞兰AI花店', W / 2, 550)

  // 标语
  ctx.fillStyle = '#a99a8f'
  ctx.font = '24px sans-serif'
  ctx.fillText('为 TA 选一束刚刚好的花', W / 2, 610)

  // 品牌
  ctx.fillStyle = '#251f1c'
  ctx.font = 'bold 30px sans-serif'
  ctx.fillText('🌷 跳舞兰 AI 花店', W / 2, 688)

  // 二维码（白底圆角面板）
  if (qrImg) {
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, 210, 745, 180, 180, 24)
    ctx.fill()
    ctx.drawImage(qrImg, 225, 760, 150, 150)
  }

  // 底部提示
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = '24px sans-serif'
  ctx.fillText(qrImg ? '长按识别二维码 · 查看商品' : shareUrl, W / 2, 950)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function genQr() {
  try {
    const QRCode = await import('qrcode')
    const dataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 300,
      errorCorrectionLevel: 'M',
      color: { dark: '#251f1c', light: '#ffffff' }
    })
    qrImg = await loadImage(dataUrl)
  } catch (e) {
    console.warn('[poster] 二维码生成失败，降级为纯文字链接：', e && e.message)
    qrImg = null
  }
}

function copyLink() {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => toast('链接已复制'))
  } else {
    toast('链接：' + shareUrl)
  }
}

const toastText = ref('')
let toastTimer = null
function toast(t) {
  toastText.value = t
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastText.value = '' }, 1600)
}

onMounted(async () => {
  await genQr()
  draw()
})
</script>

<style lang="scss" scoped>
.poster-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}
.poster-wrap {
  width: rpx(600);
  max-width: calc(100% - #{rpx(80)});
  background: #fff;
  border-radius: var(--radius-lg);
  padding: rpx(28);
  box-sizing: border-box;
  text-align: center;
}
.poster-title {
  font-size: rpx(32);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: rpx(16);
}
.poster-canvas {
  width: 100%;
  height: auto;
  border-radius: var(--radius-md);
  display: block;
}
.poster-tip {
  font-size: rpx(22);
  color: var(--text-light);
  margin: rpx(16) 0 rpx(8);
}
.poster-actions {
  display: flex;
  gap: rpx(20);
  margin-top: rpx(8);
}
.pa-btn {
  flex: 1;
  height: rpx(80);
  border: rpx(1) solid var(--border-light);
  background: var(--bg);
  color: var(--text-primary);
  font-size: rpx(28);
  border-radius: var(--radius-md);
}
.pa-primary {
  border: none;
  background: var(--primary-gradient);
  color: #fff;
}
</style>
