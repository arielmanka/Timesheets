<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { addDays, endOfWeek, format, startOfWeek } from 'date-fns'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import { useTimeRecordsStore } from '../../stores/timeRecords'
import { useProjectsStore } from '../../stores/projects'
import { useAuthStore } from '../../stores/auth'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { TimeRecord } from '../../types/timeRecord'
import { combineLocalDateTime, formatTimeOfDay } from '../../utils/datetime'
import TimeEntryForm from '../../components/time/TimeEntryForm.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import CurrencyDisplay from '../../components/ui/CurrencyDisplay.vue'
import RateField from '../../components/ui/RateField.vue'
import Modal from '../../components/ui/Modal.vue'
import ConfirmDialog from '../../components/ui/ConfirmDialog.vue'
import FormField from '../../components/ui/FormField.vue'
import AppButton from '../../components/ui/AppButton.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const route = useRoute()
const teamId = route.params.teamId as string
const timeRecords = useTimeRecordsStore()
const projects = useProjectsStore()
const auth = useAuthStore()
const ui = useUiStore()

const weekStart = ref(startOfWeek(new Date(), { weekStartsOn: 1 }))
const weekEnd = computed(() => endOfWeek(weekStart.value, { weekStartsOn: 1 }))
const weekLabel = computed(() => `${format(weekStart.value, 'MMM d')} – ${format(weekEnd.value, 'MMM d, yyyy')}`)

const { loading, run: load } = useAsyncAction(async () => {
  await Promise.all([
    timeRecords.fetchAll(teamId, {
      userId: auth.user?._id,
      // Plain yyyy-MM-dd, matching how a record's `date` field is stored
      // (literal UTC midnight of the calendar day). Using .toISOString() on
      // these local Date boundaries would shift them by the viewer's UTC
      // offset, silently excluding the first or last day of the week for
      // anyone not in UTC+0.
      startDate: format(weekStart.value, 'yyyy-MM-dd'),
      endDate: format(weekEnd.value, 'yyyy-MM-dd'),
    }),
    projects.loaded ? Promise.resolve() : projects.fetchAll(teamId),
  ])
})
onMounted(load)
watch(weekStart, load)

function shiftWeek(deltaDays: number): void {
  weekStart.value = addDays(weekStart.value, deltaDays)
}

const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)))

function recordsForDay(day: Date): TimeRecord[] {
  const key = format(day, 'yyyy-MM-dd')
  return timeRecords.items
    .filter((r) => r.date.slice(0, 10) === key)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

function projectName(projectId: string): string {
  return projects.items.find((p) => p._id === projectId)?.name ?? 'Unknown project'
}

function hours(minutes: number): string {
  return (minutes / 60).toFixed(2)
}

const weekTotalHours = computed(() =>
  (timeRecords.items.reduce((sum, r) => sum + r.durationMinutes, 0) / 60).toFixed(1)
)

// --- Inline edit ---------------------------------------------------------
const editing = ref<TimeRecord | null>(null)
const editForm = reactive({ startTime: '', endTime: '', billable: true, note: '' })

function openEdit(record: TimeRecord): void {
  if (record.locked) return
  editing.value = record
  Object.assign(editForm, {
    startTime: formatTimeOfDay(record.startTime),
    endTime: formatTimeOfDay(record.endTime),
    billable: record.billable,
    note: record.note,
  })
}

const { loading: savingEdit, run: saveEdit } = useAsyncAction(async () => {
  if (!editing.value) return
  const day = editing.value.date.slice(0, 10)
  await timeRecords.update(teamId, editing.value._id, {
    startTime: combineLocalDateTime(day, editForm.startTime),
    endTime: combineLocalDateTime(day, editForm.endTime),
    billable: editForm.billable,
    note: editForm.note,
  })
  ui.success('Time record updated.')
  editing.value = null
})

// --- Delete ---------------------------------------------------------------
const deleteTarget = ref<TimeRecord | null>(null)
const { loading: deleting, run: confirmDelete } = useAsyncAction(async () => {
  if (!deleteTarget.value) return
  await timeRecords.remove(teamId, deleteTarget.value._id)
  ui.success('Time record deleted.')
  deleteTarget.value = null
})
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div class="rounded-lg border border-surface-200 bg-white p-4">
      <h1 class="mb-4 text-sm font-semibold text-surface-800">Log time</h1>
      <TimeEntryForm :team-id="teamId" />
    </div>

    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <AppButton variant="ghost" @click="shiftWeek(-7)">← Prev</AppButton>
        <span class="text-sm font-medium text-surface-800">{{ weekLabel }}</span>
        <AppButton variant="ghost" @click="shiftWeek(7)">Next →</AppButton>
      </div>
      <span class="text-sm text-surface-500">{{ weekTotalHours }}h this week</span>
    </div>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>

    <template v-else>
      <div v-for="day in days" :key="day.toISOString()">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-400">
          {{ format(day, 'EEEE, MMM d') }}
        </h2>
        <EmptyState v-if="recordsForDay(day).length === 0" title="No time logged" class="mb-4" />
        <ul v-else class="mb-4 space-y-2">
          <li
            v-for="record in recordsForDay(day)"
            :key="record._id"
            class="rounded-lg border border-surface-200 bg-white px-4 py-2.5"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate font-medium text-surface-900">{{ projectName(record.projectId) }}</div>
                <div class="text-xs text-surface-500">
                  {{ formatTimeOfDay(record.startTime) }}–{{ formatTimeOfDay(record.endTime) }} · {{ hours(record.durationMinutes) }}h
                  <span v-if="!record.billable">· non-billable</span>
                </div>
                <p v-if="record.note" class="mt-1 text-xs text-surface-600">{{ record.note }}</p>
                <p v-if="record.status === 'rejected' && record.rejectionReason" class="mt-1 text-xs text-danger-600">
                  Rejected: {{ record.rejectionReason }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-1">
                <StatusPill :status="record.status" />
                <span class="text-xs text-surface-500">
                  <CurrencyDisplay :amount="record.calculatedCost" :currency="record.currency" />
                </span>
                <RateField class="text-xs" :amount="record.resolvedRate" :currency="record.currency" />
              </div>
            </div>
            <div v-if="!record.locked" class="mt-2 flex items-center gap-3">
              <button
                type="button"
                class="text-xs font-medium text-primary-600 hover:underline"
                @click="openEdit(record)"
              >
                Edit
              </button>
              <button
                type="button"
                class="text-xs font-medium text-danger-600 hover:underline"
                @click="deleteTarget = record"
              >
                Delete
              </button>
            </div>
            <span v-else class="mt-2 inline-block text-xs text-surface-400">Locked (approved)</span>
          </li>
        </ul>
      </div>
    </template>

    <Modal v-if="editing" title="Edit time record" @close="editing = null">
      <form id="edit-record-form" class="space-y-4" @submit.prevent="saveEdit">
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Start">
            <VueDatePicker v-model="editForm.startTime" model-type="HH:mm" time-picker :clearable="false" auto-apply />
          </FormField>
          <FormField label="End">
            <VueDatePicker v-model="editForm.endTime" model-type="HH:mm" time-picker :clearable="false" auto-apply />
          </FormField>
        </div>
        <FormField label="Billable">
          <label class="flex items-center gap-2 text-sm text-surface-700">
            <input v-model="editForm.billable" type="checkbox" class="h-4 w-4 rounded border-surface-300" />
            Billable
          </label>
        </FormField>
        <FormField label="Note">
          <textarea v-model="editForm.note" maxlength="1000" rows="2" class="field-control" />
        </FormField>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="editing = null">Cancel</AppButton>
        <AppButton form="edit-record-form" type="submit" :loading="savingEdit">Save</AppButton>
      </template>
    </Modal>

    <ConfirmDialog
      v-if="deleteTarget"
      title="Delete time record"
      message="This permanently removes this time entry. This can't be undone."
      confirm-label="Delete"
      danger
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
