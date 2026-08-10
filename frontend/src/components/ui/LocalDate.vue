<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth'

const props = withDefaults(defineProps<{ value: string | Date; withTime?: boolean }>(), { withTime: false })

const auth = useAuthStore()

const formatted = computed(() => {
  const locale = auth.user?.locale || navigator.language || 'en-US'
  const date = typeof props.value === 'string' ? new Date(props.value) : props.value
  const options: Intl.DateTimeFormatOptions = props.withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }
  return new Intl.DateTimeFormat(locale, options).format(date)
})
</script>

<template><span class="tabular-nums">{{ formatted }}</span></template>
