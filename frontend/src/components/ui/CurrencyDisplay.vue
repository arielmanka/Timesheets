<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth'

const props = defineProps<{ amount: number; currency: string }>()

const auth = useAuthStore()

const formatted = computed(() => {
  const locale = auth.user?.locale || navigator.language || 'en-US'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: props.currency }).format(props.amount)
  } catch {
    return `${props.currency} ${props.amount.toFixed(2)}`
  }
})
</script>

<template><span class="tabular-nums">{{ formatted }}</span></template>
