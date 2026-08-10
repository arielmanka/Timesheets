<script setup lang="ts">
withDefaults(defineProps<{ label: string; error?: string; hint?: string; for?: string }>(), {
  error: '',
  hint: '',
})
</script>

<template>
  <label class="block">
    <span class="mb-1 block text-sm font-medium text-surface-700">{{ label }}</span>
    <slot />
    <span v-if="error" class="mt-1 block text-xs text-danger-600">{{ error }}</span>
    <span v-else-if="hint" class="mt-1 block text-xs text-surface-500">{{ hint }}</span>
  </label>
</template>
