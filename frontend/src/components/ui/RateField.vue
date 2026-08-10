<script setup lang="ts">
// RB-8 / RB-9 mitigation: the backend does not yet redact hourly rates or a
// time record's resolvedRate for non-managers (see the audit's "Key gaps").
// This is the one place any such value is allowed to render — gated on the
// current team role, not on whether the API happened to include the field.
import { computed } from 'vue'
import { useTeamStore } from '../../stores/team'
import { useAuthStore } from '../../stores/auth'

const props = defineProps<{ amount: number | null; currency?: string }>()

const team = useTeamStore()
const auth = useAuthStore()

const formatted = computed(() => {
  if (props.amount === null) return null
  if (!props.currency) return props.amount.toFixed(2)
  const locale = auth.user?.locale || navigator.language || 'en-US'
  return new Intl.NumberFormat(locale, { style: 'currency', currency: props.currency }).format(props.amount)
})
</script>

<template>
  <span>
    <span v-if="!team.isManager" class="text-surface-400" title="Only team managers can view rates">—</span>
    <span v-else-if="formatted === null" class="text-surface-400">—</span>
    <span v-else class="tabular-nums">{{ formatted }}</span>
  </span>
</template>
