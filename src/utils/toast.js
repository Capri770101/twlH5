// 全局轻提示：全站共用一个 toast，替换原先每个页面各写一份 toastText + toast() 的重复实现。
// 用法：import { toast } from '@/utils/toast' → toast('已加入购物车')
import { ref } from 'vue'

export const toastText = ref('')
let timer = null

export function toast(text, duration = 1800) {
  toastText.value = String(text || '')
  clearTimeout(timer)
  timer = setTimeout(() => { toastText.value = '' }, duration)
}
