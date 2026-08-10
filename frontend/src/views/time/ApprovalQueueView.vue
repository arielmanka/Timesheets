<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTimeRecordsStore } from '../../stores/timeRecords'
import { useProjectsStore } from '../../stores/projects'
import { useTeamStore } from '../../stores/team'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { TimeRecord } from '../../types/timeRecord'
import { formatTimeOfDay } from '../../utils/datetime'
import CurrencyDisplay from '../../components/ui/CurrencyDisplay.vue'
import RateField from '../../components/ui/RateField.vue'
import AppButton from '../../components/ui/AppButton.vue'
import Modal from '../../components/ui/Modal.vue'
import FormField from '../../components/ui/FormField.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const route = useRoute()
const teamId = route.params.teamId as string
const timeRecords = useTimeRecordsStore()
const projects = useProjectsStore()
const team = useTeamStore()
const ui = useUiStore()

const { loading, run: load } = useAsyncAction(async () => {
  await Promise.all([
    timeRecords.fetchAll(teamId, { status: 'pending' }),
    projects.loaded ? Promise.resolve() : projects.fetchAll(teamId),
  ])
})
onMounted(load)

const pending = computed(() => timeRecords.items.filter((r) => r.status === 'pending'))

function projectName(projectId: string): string {
  return projects.items.find((p) => p._id === projectId)?.name ?? 'Unknown project'
}
function memberName(userId: string): string {
  const member = team.current?.members.find((m) => m.userId === userId)
  return member ? `${member.firstName} ${member.lastName}` : 'Unknown'
}

const { run: approve } = useAsyncAction(async (record: TimeRecord) => {
  await timeRecords.approve(teamId, record._id)
  ui.success('Record approved.')
})

const rejecting = ref<TimeRecord | null>(null)
const rejectReason = ref('')
const { loading: rejectSubmitting, run: confirmReject } = useAsyncAction(async () => {
  if (!rejecting.value) return
  await timeRecords.reject(teamId, rejecting.value._id, rejectReason.value)
  ui.success('Record rejected.')
  rejecting.value = null
  rejectReason.value = ''
})
</script>

<template>
  <div class="max-w-3xl">
    <h1 class="mb-5 text-lg font-semibold text-surface-900">Approvals</h1>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>
    <EmptyState v-else-if="pending.length === 0" title="Nothing to review" message="All caught up." />

    <ul v-else class="space-y-2">
      <li v-for="record in pending" :key="record._id" class="rounded-lg border border-surface-200 bg-white px-4 py-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-medium text-surface-900">{{ memberName(record.userId) }} · {{ projectName(record.projectId) }}</div>
            <div class="text-xs text-surface-500">
              {{ record.date.slice(0, 10) }} · {{ formatTimeOfDay(record.startTime) }}–{{ formatTimeOfDay(record.endTime) }} ·
              {{ (record.durationMinutes / 60).toFixed(2) }}h
              <span v-if="!record.billable">· non-billable</span>
            </div>
            <p v-if="record.note" class="mt-1 text-sm text-surface-600">{{ record.note }}</p>
          </div>
          <div class="shrink-0 text-right text-xs text-surface-500">
            <div><CurrencyDisplay :amount="record.calculatedCost" :currency="record.currency" /></div>
            <RateField :amount="record.resolvedRate" :currency="record.currency" />
          </div>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <AppButton @click="approve(record)">Approve</AppButton>
          <AppButton variant="danger" @click="rejecting = record">Reject</AppButton>
        </div>
      </li>
    </ul>

    <Modal v-if="rejecting" title="Reject time record" @close="rejecting = null">
      <form id="reject-form" @submit.prevent="confirmReject">
        <FormField label="Reason">
          <textarea v-model="rejectReason" required maxlength="500" rows="3" class="field-control" />
        </FormField>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="rejecting = null">Cancel</AppButton>
        <AppButton form="reject-form" type="submit" variant="danger" :loading="rejectSubmitting">Reject</AppButton>
      </template>
    </Modal>
  </div>
</template>
