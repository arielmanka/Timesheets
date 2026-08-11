<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTeamStore } from '../../stores/team'
import * as auditLogService from '../../services/auditLog.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import type { AuditLogEntry } from '../../types/auditLog'
import LocalDate from '../../components/ui/LocalDate.vue'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const route = useRoute()
const teamId = route.params.teamId as string
const team = useTeamStore()

// The event types this system currently writes to the immutable audit log
// (NFR-6): invoice generation, time-record approvals/rejections, and rate
// changes on a team member, project, or task.
const EVENT_TYPES = [
  { value: '', label: 'All events' },
  { value: 'invoice_generated', label: 'Invoice generated' },
  { value: 'time_record_approved', label: 'Time record approved' },
  { value: 'time_record_unapproved', label: 'Time record reverted to pending' },
  { value: 'time_record_rejected', label: 'Time record rejected' },
  { value: 'member_rate_changed', label: 'Member rate changed' },
  { value: 'project_rate_changed', label: 'Project rate changed' },
  { value: 'task_rate_changed', label: 'Task rate changed' },
  { value: 'task_billable_changed', label: 'Task billable changed' },
]
const ENTITY_TYPES = ['', 'Invoice', 'TimeRecord', 'TeamMember', 'Project', 'Task']

const PAGE_SIZE = 50
const filters = reactive({ eventType: '', entityType: '', startDate: '', endDate: '' })
const logs = ref<AuditLogEntry[]>([])
const total = ref(0)

const { loading, run: loadFirstPage } = useAsyncAction(async () => {
  const result = await auditLogService.getAuditLog(teamId, {
    eventType: filters.eventType || undefined,
    entityType: filters.entityType || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    limit: PAGE_SIZE,
    skip: 0,
  })
  logs.value = result.logs
  total.value = result.total
})
loadFirstPage()

const { loading: loadingMore, run: loadMore } = useAsyncAction(async () => {
  const result = await auditLogService.getAuditLog(teamId, {
    eventType: filters.eventType || undefined,
    entityType: filters.entityType || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    limit: PAGE_SIZE,
    skip: logs.value.length,
  })
  logs.value = [...logs.value, ...result.logs]
  total.value = result.total
})

function actorName(actorId: string): string {
  const m = team.current?.members.find((mm) => mm.userId === actorId)
  return m ? `${m.firstName} ${m.lastName}` : actorId
}

const EVENT_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_TYPES.filter((e) => e.value).map((e) => [e.value, e.label])
)

// Every entry's `details` was denormalized at write time (names, previous
// and new values, etc.) specifically so this page never needs to re-fetch
// or guess at what a since-renamed or since-deleted project/user was called.
function rateChangeLabel(d: Record<string, unknown>): string {
  const prev = d.previousRate == null ? 'unset' : String(d.previousRate)
  const next = d.newRate == null ? 'unset' : String(d.newRate)
  return `${prev} → ${next}`
}
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <div>
      <h1 class="text-lg font-semibold text-surface-900">Audit log</h1>
      <p class="mt-1 text-sm text-surface-500">
        An immutable record of rate changes, time record approvals and rejections, and invoice generation for this
        team.
      </p>
    </div>

    <form class="grid grid-cols-2 gap-3 rounded-lg border border-surface-200 bg-white p-4 sm:grid-cols-4" @submit.prevent="loadFirstPage">
      <FormField label="Event">
        <select v-model="filters.eventType" class="field-control">
          <option v-for="e in EVENT_TYPES" :key="e.value" :value="e.value">{{ e.label }}</option>
        </select>
      </FormField>
      <FormField label="Entity type">
        <select v-model="filters.entityType" class="field-control">
          <option v-for="t in ENTITY_TYPES" :key="t" :value="t">{{ t || 'All types' }}</option>
        </select>
      </FormField>
      <FormField label="Start date">
        <input v-model="filters.startDate" type="date" class="field-control" />
      </FormField>
      <FormField label="End date">
        <input v-model="filters.endDate" type="date" class="field-control" />
      </FormField>
      <div class="col-span-2 flex items-end sm:col-span-4">
        <AppButton type="submit" :loading="loading">Apply filters</AppButton>
      </div>
    </form>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>
    <EmptyState
      v-else-if="logs.length === 0"
      title="No audit entries"
      message="Nothing matches these filters yet — rate changes, approvals, rejections, and invoice generation will show up here as they happen."
    />
    <template v-else>
      <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
        <table class="w-full text-sm">
          <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
            <tr>
              <th class="px-4 py-2 font-medium">When</th>
              <th class="px-4 py-2 font-medium">Event</th>
              <th class="px-4 py-2 font-medium">Actor</th>
              <th class="px-4 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-100">
            <tr v-for="entry in logs" :key="entry._id">
              <td class="px-4 py-2 whitespace-nowrap text-surface-500"><LocalDate :value="entry.timestamp" with-time /></td>
              <td class="px-4 py-2 whitespace-nowrap font-medium text-surface-800">
                {{ EVENT_LABELS[entry.eventType] ?? entry.eventType }}
              </td>
              <td class="px-4 py-2 whitespace-nowrap text-surface-600">{{ actorName(entry.actorId) }}</td>
              <td class="px-4 py-2 text-surface-600">
                <template v-if="entry.eventType === 'invoice_generated'">
                  Invoice #{{ entry.details.invoiceNumber }} ({{ entry.details.type }}) — total {{ entry.details.total }}
                </template>
                <template v-else-if="entry.eventType.startsWith('time_record_')">
                  {{ entry.details.userName }} — {{ entry.details.projectName }}<template v-if="entry.details.taskName"> / {{ entry.details.taskName }}</template>
                  · {{ (Number(entry.details.durationMinutes) / 60).toFixed(2) }}h on {{ String(entry.details.date).slice(0, 10) }}
                  <span v-if="entry.details.reason" class="text-surface-400">— "{{ entry.details.reason }}"</span>
                </template>
                <template v-else-if="entry.eventType === 'member_rate_changed'">
                  {{ entry.details.targetUserName }}: {{ rateChangeLabel(entry.details) }}
                </template>
                <template v-else-if="entry.eventType === 'project_rate_changed'">
                  {{ entry.details.projectName }}: {{ rateChangeLabel(entry.details) }}
                </template>
                <template v-else-if="entry.eventType === 'task_rate_changed'">
                  {{ entry.details.taskName }} ({{ entry.details.projectName }}): {{ rateChangeLabel(entry.details) }}
                </template>
                <template v-else-if="entry.eventType === 'task_billable_changed'">
                  {{ entry.details.taskName }} ({{ entry.details.projectName }}): {{ entry.details.previousBillable ? 'Billable' : 'Non-billable' }} →
                  {{ entry.details.newBillable ? 'Billable' : 'Non-billable' }}
                </template>
                <template v-else>{{ JSON.stringify(entry.details) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between">
        <p class="text-xs text-surface-500">Showing {{ logs.length }} of {{ total }}</p>
        <AppButton v-if="logs.length < total" variant="secondary" :loading="loadingMore" @click="loadMore">
          Load more
        </AppButton>
      </div>
    </template>
  </div>
</template>
