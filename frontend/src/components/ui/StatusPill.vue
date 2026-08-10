<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: string }>()

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const TONE_BY_STATUS: Record<string, Tone> = {
  // time record
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  // project
  active: 'success',
  on_hold: 'warning',
  complete: 'info',
  cancelled: 'neutral',
  // task
  open: 'neutral',
  in_progress: 'info',
  done: 'success',
  // invoice
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  partially_paid: 'warning',
  overdue: 'danger',
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-200 text-surface-700',
  info: 'bg-primary-500/10 text-primary-700',
  success: 'bg-success-500/15 text-success-600',
  warning: 'bg-warning-500/15 text-warning-600',
  danger: 'bg-danger-500/15 text-danger-600',
}

const tone = computed(() => TONE_BY_STATUS[props.status] ?? 'neutral')
const label = computed(() => props.status.replace(/_/g, ' '))
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
    :class="TONE_CLASSES[tone]"
  >
    {{ label }}
  </span>
</template>
