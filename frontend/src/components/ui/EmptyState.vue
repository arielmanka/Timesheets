<script setup lang="ts">
withDefaults(defineProps<{ title: string; message?: string }>(), { message: '' })
</script>

<template>
  <div class="flex flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 px-6 py-12 text-center">
    <p class="text-sm font-medium text-surface-700">{{ title }}</p>
    <p v-if="message" class="mt-1 max-w-sm text-sm text-surface-500">{{ message }}</p>
    <div v-if="$slots.action" class="mt-4"><slot name="action" /></div>
  </div>
</template>
