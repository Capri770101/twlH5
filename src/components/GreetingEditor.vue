<template>
  <details class="greeting-editor">
    <summary>配一张贺卡</summary>
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
    <button type="button" :disabled="busy || !text.trim()" @click="makeImage">确认文案并生成贺卡</button>
    <p v-if="error" role="alert">{{ error }}</p>
    <a v-if="image" :href="image" target="_blank" rel="noopener"><img :src="image" alt="已生成的贺卡，点击查看原图" /></a>
    <p>贺卡由 AI 辅助创作，请核对称呼和心意；不会自动发送给收件人。</p>
  </details>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { draftGreeting, renderGreeting, normalizeAgentAssetUrl } from '@/mock/api'
const props = defineProps({ plan: { type: Object, default: () => ({}) } })
const recipient = ref(String(props.plan.recipient || ''))
const occasion = ref(String(props.plan.occasion || ''))
const intent = ref(''), tone = ref('warm'), text = ref(''), sender = ref(''), template = ref('warm')
const busy = ref(false), error = ref(''), image = ref('')
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
    const result = await renderGreeting({ text: text.value, recipient: recipient.value, sender: sender.value, occasion: occasion.value, template: template.value }, signal)
    if (!result.data?.image_url) throw new Error('missing image')
    image.value = normalizeAgentAssetUrl(result.data.image_url)
  })
}
</script>

<style scoped>
.greeting-editor { margin-top: 16px; padding: 16px; border: 1px solid #e4dcce; border-radius: 12px; }
summary { cursor: pointer; font-weight: 600; }
label { display: block; margin: 12px 0; }
input, textarea, select { display: block; width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #d3c8b4; border-radius: 6px; font: inherit; }
textarea { min-height: 80px; }
button { padding: 10px; background: #2b4133; color: white; border: 0; border-radius: 6px; }
button:disabled { opacity: .5; }
img { width: 100%; margin-top: 12px; }
p { font-size: 12px; color: #5b554b; }
</style>
