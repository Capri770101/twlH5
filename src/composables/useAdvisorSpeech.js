import { ref, computed, watch, onUnmounted } from 'vue'
import { advisorSpeech, normalizeAgentAssetUrl } from '@/mock/api'
import { toast } from '@/utils/toast'

const MAX_BYTES = 10 * 1024 * 1024
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']

export function useAdvisorSpeech({ inputText, activeId, generating }) {
  const recordingState = ref('idle')
  const seconds = ref(0)
  const notice = ref('')
  const playingMessage = ref(null)
  const playbackState = ref('idle')
  const autoSpeak = ref(false)
  try { autoSpeak.value = localStorage.getItem('twd_advisor_auto_speak') === '1' } catch {}
  const playbackNotice = ref('')
  const busy = computed(() => recordingState.value !== 'idle')
  const micHint = !window.isSecureContext
    ? '当前为 HTTP 页面，浏览器不允许录音；可上传已有音频转文字。'
    : (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        ? '当前浏览器不支持录音，可上传已有音频转文字。' : ''
  let recorder, stream, timer, request, player, playbackRequest
  let recordingVersion = 0
  let playbackVersion = 0
  let audioContext, audioSource

  // 在开关/发送按钮的同步点击内解锁音频，避免等待网络后失去用户手势。
  function unlockPlayback() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext
      if (!Context) return
      audioContext ||= new Context()
      audioContext.resume().catch(() => {})
    } catch {}
  }

  function setAutoSpeak(enabled) {
    autoSpeak.value = enabled
    try { localStorage.setItem('twd_advisor_auto_speak', enabled ? '1' : '0') } catch {}
    playbackNotice.value = ''
    if (enabled) unlockPlayback()
    else stopPlayback()
  }

  function autoPlayReply(message) {
    if (autoSpeak.value && !busy.value && message && (message.speechText || message.text)) playReply(message)
  }

  function releaseMic() {
    clearInterval(timer)
    stream?.getTracks().forEach(track => track.stop())
    stream = null
  }

  function cancelRecording() {
    recordingVersion++
    request?.abort()
    request = null
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    recorder = null
    releaseMic()
    recordingState.value = 'idle'
    seconds.value = 0
  }

  function stopPlayback() {
    playbackVersion++
    if (audioSource) {
      audioSource.onended = null
      audioSource.stop()
      audioSource.disconnect()
      audioSource = null
    }
    playbackRequest?.abort()
    playbackRequest = null
    if (player) {
      player.pause()
      player.removeAttribute('src')
      player.load()
    }
    player = null
    playingMessage.value = null
    playbackState.value = 'idle'
    playbackNotice.value = ''
  }

  async function transcribe(file, version = recordingVersion) {
    if (!file.size || file.size > MAX_BYTES) {
      notice.value = file.size ? '音频不能超过 10MB，请选择较短的录音。' : '没有录到声音，请重试。'
      recordingState.value = 'idle'
      return
    }
    stopPlayback()
    recordingState.value = 'transcribing'
    notice.value = ''
    const controller = new AbortController()
    request = controller
    const timeout = setTimeout(() => controller.abort(), 95000)
    try {
      const result = await advisorSpeech('transcribe', file, controller.signal)
      if (version !== recordingVersion) return
      const text = String(result.text || '').trim()
      if (!text) throw new Error('没有识别到文字，请再说一次。')
      inputText.value = [inputText.value.trim(), text].filter(Boolean).join(' ')
      notice.value = '已转成文字，可修改后再发送。'
    } catch (e) {
      if (version === recordingVersion) notice.value = e.name === 'AbortError'
        ? '转写超时，请重试。' : (e.message || '转写失败，请重试。')
    } finally {
      clearTimeout(timeout)
      if (version === recordingVersion) {
        recordingState.value = 'idle'
        request = null
      }
    }
  }

  async function startRecording() {
    if (busy.value || generating.value) return
    if (micHint) { notice.value = micHint; return }
    stopPlayback()
    const version = ++recordingVersion
    recordingState.value = 'requesting'
    notice.value = ''
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (version !== recordingVersion) {
        acquired.getTracks().forEach(track => track.stop())
        return
      }
      stream = acquired
      const mimeType = MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('当前浏览器的录音格式不受支持，请上传音频。')
      const current = new MediaRecorder(stream, { mimeType })
      recorder = current
      const chunks = []
      let bytes = 0
      current.ondataavailable = event => {
        if (version !== recordingVersion || !event.data.size) return
        chunks.push(event.data)
        bytes += event.data.size
        if (bytes > MAX_BYTES) {
          cancelRecording()
          notice.value = '录音超过 10MB，请缩短录音后重试。'
        }
      }
      current.onerror = () => {
        if (version !== recordingVersion) return
        cancelRecording()
        notice.value = '录音中断，请检查麦克风后重试。'
      }
      current.onstop = () => {
        if (version !== recordingVersion) return
        releaseMic()
        recorder = null
        const type = current.mimeType.split(';')[0]
        const ext = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm'
        transcribe(new File(chunks, 'recording.' + ext, { type }), version)
      }
      current.start(1000)
      recordingState.value = 'recording'
      seconds.value = 0
      const startedAt = Date.now()
      timer = setInterval(() => {
        seconds.value = Math.min(60, Math.floor((Date.now() - startedAt) / 1000))
        if (seconds.value >= 60) finishRecording()
      }, 250)
    } catch (e) {
      if (version !== recordingVersion) return
      cancelRecording()
      notice.value = e.name === 'NotAllowedError' ? '麦克风权限未开启，请在浏览器设置中允许录音。'
        : e.name === 'NotFoundError' ? '未找到麦克风，可上传已有音频。'
          : (e.message || '无法开始录音，请重试。')
    }
  }

  function finishRecording() {
    if (recorder?.state !== 'recording') return
    recordingState.value = 'transcribing'
    clearInterval(timer)
    recorder.stop()
    releaseMic()
  }

  function uploadAudio(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy.value || generating.value) return
    const type = file.type.split(';')[0]
    const types = { wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', webm: 'audio/webm', amr: 'audio/amr' }
    const mime = types[file.name.split('.').pop().toLowerCase()]
    if (!mime) { notice.value = '请选择 WAV、MP3、M4A、AAC、OGG、WebM 或 AMR 音频。'; return }
    transcribe(new File([file], file.name, { type: type.startsWith('audio/') ? type : mime }), ++recordingVersion)
  }

  async function playReply(message) {
    if (playingMessage.value === message) { stopPlayback(); return }
    if (busy.value) { toast('请先完成录音或转写'); return }
    stopPlayback()
    const version = playbackVersion
    playingMessage.value = message
    playbackState.value = 'loading'
    const audio = new Audio()
    player = audio
    const controller = new AbortController()
    playbackRequest = controller
    const timeout = setTimeout(() => controller.abort(), 75000)
    try {
      const data = await advisorSpeech('tts', String(message.speechText || message.text || '').slice(0, 300), controller.signal)
      if (version !== playbackVersion) return
      if (!data.audio_url) throw new Error('未取得语音，请重试。')
      audio.src = normalizeAgentAssetUrl(data.audio_url)
      // 已由用户点击解锁的 Web Audio 可以在异步回复完成后直接播报。
      if (audioContext?.state === 'running') {
        const response = await fetch(audio.src, { signal: controller.signal })
        if (!response.ok) throw new Error('音频下载失败，请重试')
        const buffer = await audioContext.decodeAudioData(await response.arrayBuffer())
        if (version !== playbackVersion) return
        if (audioContext.state === 'running') {
          const source = audioContext.createBufferSource()
          source.buffer = buffer
          source.connect(audioContext.destination)
          source.onended = () => { if (version === playbackVersion) stopPlayback() }
          audioSource = source
          source.start()
          playbackState.value = 'playing'
          return
        }
      }
      audio.onended = () => { if (version === playbackVersion) stopPlayback() }
      audio.onerror = () => {
        if (version !== playbackVersion) return
        stopPlayback()
        toast('音频加载失败，请重试')
      }
      playbackState.value = 'ready'
      await audio.play()
      if (version === playbackVersion) playbackState.value = 'playing'
    } catch (e) {
      if (version !== playbackVersion) return
      if (e.name === 'NotAllowedError') {
        // 移动端可能不允许异步合成后播放，保留音频，下一次点击直接播放。
        playbackState.value = 'ready'
        playbackNotice.value = '浏览器暂停了自动播放，请点击回复下方的“点击播放”。'
      } else {
        stopPlayback()
        toast(e.name === 'AbortError' ? '语音合成超时，请重试' : (e.message || '语音播放失败'))
      }
    } finally { clearTimeout(timeout) }
  }

  function toggleReply(message) {
    unlockPlayback()
    if (playingMessage.value === message && playbackState.value === 'ready' && player) {
      const version = playbackVersion
      playbackNotice.value = ''
      player.play().then(() => {
        if (version === playbackVersion) playbackState.value = 'playing'
      }).catch(() => { if (version === playbackVersion) { stopPlayback(); toast('播放失败，请重试') } })
    } else playReply(message)
  }

  function reset() { cancelRecording(); stopPlayback(); notice.value = '' }
  watch(activeId, reset, { flush: 'sync' })
  onUnmounted(() => { reset(); audioContext?.close().catch(() => {}) })
  return { recordingState, seconds, notice, busy, micHint, playingMessage, playbackState,
    autoSpeak, playbackNotice, setAutoSpeak, autoPlayReply, unlockPlayback,
    startRecording, finishRecording, cancelRecording, uploadAudio, toggleReply, stopPlayback }
}
