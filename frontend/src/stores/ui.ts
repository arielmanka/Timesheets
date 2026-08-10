import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastTone = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

let nextId = 1

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])

  function push(message: string, tone: ToastTone = 'info', durationMs = 5000): void {
    const id = nextId++
    toasts.value.push({ id, tone, message })
    setTimeout(() => dismiss(id), durationMs)
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function success(message: string): void {
    push(message, 'success')
  }

  function error(message: string): void {
    push(message, 'error', 8000)
  }

  return { toasts, push, dismiss, success, error }
})
