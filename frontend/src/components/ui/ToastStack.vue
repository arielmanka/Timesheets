<script setup lang="ts">
import { useUiStore } from '../../stores/ui'

const ui = useUiStore()

const TONE_CLASSES: Record<string, string> = {
  info: 'bg-surface-900 text-white',
  success: 'bg-success-600 text-white',
  error: 'bg-danger-600 text-white',
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        class="pointer-events-auto flex max-w-md items-center gap-3 rounded-md px-4 py-2.5 text-sm shadow-lg"
        :class="TONE_CLASSES[toast.tone]"
      >
        <span>{{ toast.message }}</span>
        <button type="button" class="opacity-70 hover:opacity-100" aria-label="Dismiss" @click="ui.dismiss(toast.id)">
          ✕
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
