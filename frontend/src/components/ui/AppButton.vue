<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
    type?: 'button' | 'submit'
    disabled?: boolean
    loading?: boolean
  }>(),
  { variant: 'primary', type: 'button', disabled: false, loading: false }
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
    :class="{
      'bg-primary-600 text-white hover:bg-primary-700 focus-visible:outline-primary-500': variant === 'primary',
      'bg-surface-100 text-surface-800 border border-surface-300 hover:bg-surface-200': variant === 'secondary',
      'bg-danger-600 text-white hover:bg-danger-600/90 focus-visible:outline-danger-500': variant === 'danger',
      'text-surface-600 hover:bg-surface-100': variant === 'ghost',
    }"
  >
    <svg
      v-if="loading"
      class="h-3.5 w-3.5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
    <slot />
  </button>
</template>
