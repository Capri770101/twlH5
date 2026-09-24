<template>
  <details class="greeting-editor" :open="defaultOpen">
    <summary>{{ summaryText }}</summary>
    <form @submit.prevent="makeDraft">
      <label>称呼<input v-model="recipient" maxlength="40" placeholder="例如：亲爱的妈妈" @input="image = ''" /></label>
      <label>场合<input v-model="occasion" maxlength="40" placeholder="例如：生日" /></label>
      <label>想表达的心意<textarea v-model="intent" maxlength="600" required placeholder="告诉我你想说的话，不必组织好语言" /></label>
      <label>语气<select v-model="tone"><option value="warm">温暖</option><option value="literary">文艺</option><option value="playful">俏皮</option><option value="formal">正式</option><option value="deep">深情</option></select></label>
      <button :disabled="busy || !intent.trim()">{{ busy ? '处理中…' : '生成文案草稿' }}</button>
    </form>
    <label>正文（可编辑，最多200字）<textarea v-model="text" maxlength="200" @input="image = ''" /></label>
    <label>落款<input v-model="sender" maxlength="40" @input="image = ''" /></label>
    <label>模板<select v-model="template" @change="image = ''"><option value="warm">暖色</option><option value="blush">淡粉</option><option value="green">墨绿</option><option value="letter">信笺</option><option value="night">夜色</option></select></label>
    <button type="button" :disabled="busy || !text.trim()" @click="makeImage">{{ generating ? '贺卡生成中…' : '生成 AI 贺卡' }}</button>
    <p v-if="generating" class="gen-note">AI 正在绘制专属背景并排版文字，约需 10-30 秒，请勿离开页面。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <a v-if="image" :href="image" target="_blank" rel="noopener"><img :src="image" alt="已生成的贺卡，点击查看原图" /></a>
    <div v-if="image" class="image-actions">
      <button type="button" @click="downloadImage">下载贺卡</button>
      <button type="button" :disabled="saving" @click="saveImage">{{ saving ? '保存中…' : '保存到账号' }}</button>
      <button type="button" class="primary" @click="useForOrder">使用这张贺卡</button>
    </div>
    <p v-if="!store.isLogged" class="login-hint">登录后可保存贺卡到账号，并在结算页选用。</p>
    <p>贺卡背景由 AI 生成，文字由系统排版，请核对称呼和心意；不会自动发送给收件人。</p>
  </details>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { draftGreeting, renderGreeting, normalizeAgentAssetUrl, saveGreeting, pollAgentTask } from '@/mock/api'
import store from '@/store'
import { toast } from '@/utils/toast'

const props = defineProps({
  plan: { type: Object, default: () => ({}) },
  defaultOpen: { type: Boolean, default: false },
  summaryText: { type: String, default: '配一张贺卡' }
})
const emit = defineEmits(['ready'])

const recipient = ref(String(props.plan.recipient || ''))
const occasion = ref(String(props.plan.occasion || ''))
const intent = ref(''), tone = ref('warm'), text = ref(''), sender = ref(''), template = ref('warm')
const busy = ref(false), error = ref(''), image = ref('')
const generating = ref(false), saving = ref(false)
let controller
onBeforeUnmount(() => controller?.abort())

async function perform(action) {
  if (busy.value) return
  busy.value = true; error.value = ''; controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try { await action(controller.signal) }
  catch (e) { error.value = e.name === 'AbortError' ? '请求已取消或超时，请重试' : '贺卡处理失败，请稍后重试' }
  finally { clearTimeout(timer); busy.value = false }
}

function makeDraft() {
  return perform(async signal => {
    const name = String(props.plan.name || '').slice(0, 80)
    const result = await draftGreeting({ items: name ? [{ name, quantity: 1 }] : [], recipient: recipient.value, occasion: occasion.value, customer_intent: intent.value, tone: tone.value }, signal)
    text.value = result.text || ''; image.value = ''
  })
}

function makeImage() {
  return perform(async signal => {
    generating.value = true
    image.value = ''
    try {
      const result = await renderGreeting({ text: text.value, recipient: recipient.value, sender: sender.value, occasion: occasion.value, template: template.value }, signal)
      const direct = result.data?.image_url
      if (direct) {
        image.value = normalizeAgentAssetUrl(direct)
      } else if (result.data?.poll) {
        await pollAgentTask(result.data.poll, {
          onImage: url => { image.value = url },
          onStatus: (status, msg) => {
            if (status === 'failed') error.value = msg || '贺卡生成失败，请重试'
          }
        })
        if (!image.value && !error.value) error.value = '贺卡生成超时，请重试'
      } else {
        error.value = '贺卡服务未返回图片'
      }
    } finally {
      generating.value = false
    }
  })
}

async function downloadImage() {
  if (!image.value) return
  try {
    const response = await fetch(image.value)
    if (!response.ok) throw new Error('download failed')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ai-greeting-card.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (e) {
    window.open(image.value, '_blank', 'noopener')
    toast('已打开贺卡原图，请长按或右键保存')
  }
}

async function saveImage() {
  if (!store.isLogged) { toast('请先登录后保存贺卡'); return }
  if (!text.value.trim() || !image.value || saving.value) return
  saving.value = true
  try {
    await saveGreeting({ text: text.value, imageUrl: image.value, template: template.value, recipient: recipient.value, sender: sender.value, occasion: occasion.value })
    toast('贺卡已保存到账号')
  } catch (e) {
    toast((e && e.message) || '贺卡保存失败，请稍后重试')
  } finally { saving.value = false }
}

function useForOrder() {
  if (!image.value) { toast('请先生成贺卡'); return }
  emit('ready', {
    text: text.value,
    imageUrl: image.value,
    template: template.value,
    recipient: recipient.value,
    sender: sender.value,
    occasion: occasion.value
  })
}
</script>

<style scoped>
.greeting-editor { margin-top: 16px; padding: 16px; border: 1px solid #e4dcce; border-radius: 12px; background: #fffdf9; }
summary { cursor: pointer; font-weight: 600; }
label { display: block; margin: 12px 0; }
input, textarea, select { display: block; width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #d3c8b4; border-radius: 6px; font: inherit; }
textarea { min-height: 80px; }
button { padding: 10px; background: #2b4133; color: white; border: 0; border-radius: 6px; }
button:disabled { opacity: .5; }
img { width: 100%; margin-top: 12px; border-radius: 8px; }
p { font-size: 12px; color: #5b554b; }
.image-actions { display: flex; gap: 8px; margin-top: 10px; }
.image-actions button { flex: 1; }
.image-actions .primary { background: #a8543f; }
.login-hint { color: #8a6b35; }
.gen-note { color: #2b6b4f; }
</style>
