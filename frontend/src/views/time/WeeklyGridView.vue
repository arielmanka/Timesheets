<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { addDays, endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import { useTimeRecordsStore } from '../../stores/timeRecords'
import { useProjectsStore } from '../../stores/projects'
import { useAuthStore } from '../../stores/auth'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import * as timeRecordsService from '../../services/timeRecords.service'
import * as tasksService from '../../services/tasks.service'
import type { TimeRecord, CrossTeamTimeRecord } from '../../types/timeRecord'
import type { Task } from '../../types/task'
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

// "Show all teams": lets a user see their own time logged in every team they
// belong to, not just the one they're currently viewing — mainly so a
// same-day overlap block (which is enforced across all teams) is
// understandable when the conflicting entry lives elsewhere. Read-only for
// other teams' entries; editing still happens from that team's own Time view.
const SHOW_ALL_TEAMS_KEY = 'timesheets.showAllTeams'
const showAllTeams = ref(localStorage.getItem(SHOW_ALL_TEAMS_KEY) === 'true')
watch(showAllTeams, (value) => {
  localStorage.setItem(SHOW_ALL_TEAMS_KEY, String(value))
  load()
})
const otherTeamEntries = ref<CrossTeamTimeRecord[]>([])

// --- Filters ---------------------------------------------------------------
const filterProjectId = ref('')
const filterTaskId = ref('')
const filterTasks = ref<Task[]>([])
const filterBillable = ref<'' | 'true' | 'false'>('')
const filterStatus = ref<'' | 'pending' | 'approved' | 'rejected'>('')

watch(filterProjectId, async (projectId) => {
  filterTaskId.value = ''
  filterTasks.value = projectId ? await tasksService.listTasks(teamId, projectId) : []
})

const hasActiveFilters = computed(
  () => !!filterProjectId.value || !!filterTaskId.value || !!filterBillable.value || !!filterStatus.value
)
function clearFilters(): void {
  filterProjectId.value = ''
  filterBillable.value = ''
  filterStatus.value = ''
}

const { loading, run: load } = useAsyncAction(async () => {
  // Plain yyyy-MM-dd, matching how a record's `date` field is stored
  // (literal UTC midnight of the calendar day). Using .toISOString() on
  // these local Date boundaries would shift them by the viewer's UTC
  // offset, silently excluding the first or last day of the week for
  // anyone not in UTC+0.
  const startDate = format(weekStart.value, 'yyyy-MM-dd')
  const endDate = format(weekEnd.value, 'yyyy-MM-dd')
  const billable = filterBillable.value === '' ? undefined : filterBillable.value === 'true'
  const status = filterStatus.value || undefined

  await Promise.all([
    timeRecords.fetchAll(teamId, {
      userId: auth.user?._id,
      startDate,
      endDate,
      projectId: filterProjectId.value || undefined,
      taskId: filterTaskId.value || undefined,
      billable,
      status,
    }),
    projects.loaded ? Promise.resolve() : projects.fetchAll(teamId),
    // Project/task filters are team-specific IDs, meaningless against other
    // teams' own projects, so only billable/status carry over to this list.
    showAllTeams.value
      ? timeRecordsService.listMyTimeRecordsAcrossTeams({ startDate, endDate, billable, status }).then((entries) => {
          otherTeamEntries.value = entries.filter((e) => e.teamId !== teamId)
        })
      : Promise.resolve().then(() => {
          otherTeamEntries.value = []
        }),
  ])
})
onMounted(load)
watch([weekStart, filterProjectId, filterTaskId, filterBillable, filterStatus], load)

function shiftWeek(deltaDays: number): void {
  weekStart.value = addDays(weekStart.value, deltaDays)
}

const jumpDate = ref('')
function onJumpDate(value: string | null): void {
  if (!value) return
  weekStart.value = startOfWeek(parseISO(value), { weekStartsOn: 1 })
}

const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)))

type DayEntry =
  | { kind: 'own'; startTime: string; record: TimeRecord }
  | { kind: 'other'; startTime: string; entry: CrossTeamTimeRecord }

function recordsForDay(day: Date): DayEntry[] {
  const key = format(day, 'yyyy-MM-dd')
  const own: DayEntry[] = timeRecords.items
    .filter((r) => r.date.slice(0, 10) === key)
    .map((record) => ({ kind: 'own', startTime: record.startTime, record }))
  const other: DayEntry[] = otherTeamEntries.value
    .filter((e) => e.record.date.slice(0, 10) === key)
    .map((entry) => ({ kind: 'other', startTime: entry.record.startTime, entry }))
  return [...own, ...other].sort((a, b) => a.startTime.localeCompare(b.startTime))
}

function projectName(projectId: string): string {
  return projects.items.find((p) => p._id === projectId)?.name ?? 'Unknown project'
}

function hours(minutes: number): string {
  return (minutes / 60).toFixed(2)
}

const weekTotalHours = computed(() => {
  const ownMinutes = timeRecords.items.reduce((sum, r) => sum + r.durationMinutes, 0)
  const otherMinutes = otherTeamEntries.value.reduce((sum, e) => sum + e.record.durationMinutes, 0)
  return ((ownMinutes + otherMinutes) / 60).toFixed(1)
})

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
        <VueDatePicker
          v-model="jumpDate"
          model-type="yyyy-MM-dd"
          format="yyyy-MM-dd"
          :enable-time-picker="false"
          :clearable="false"
          auto-apply
          placeholder="Jump to date"
          class="w-36"
          @update:model-value="onJumpDate"
        />
      </div>
      <span class="text-sm text-surface-500">{{ weekTotalHours }}h this week</span>
    </div>

    <div class="flex flex-wrap items-end gap-3 rounded-lg border border-surface-200 bg-white p-3">
      <FormField label="Project" class="w-40">
        <select v-model="filterProjectId" class="field-control">
          <option value="">All projects</option>
          <option v-for="p in projects.items" :key="p._id" :value="p._id">{{ p.name }}</option>
        </select>
      </FormField>
      <FormField label="Task" class="w-40">
        <select v-model="filterTaskId" class="field-control" :disabled="!filterProjectId">
          <option value="">All tasks</option>
          <option v-for="t in filterTasks" :key="t._id" :value="t._id">{{ t.name }}</option>
        </select>
      </FormField>
      <FormField label="Billable" class="w-32">
        <select v-model="filterBillable" class="field-control">
          <option value="">All</option>
          <option value="true">Billable</option>
          <option value="false">Non-billable</option>
        </select>
      </FormField>
      <FormField label="Status" class="w-32">
        <select v-model="filterStatus" class="field-control">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </FormField>
      <AppButton v-if="hasActiveFilters" variant="ghost" @click="clearFilters">Clear filters</AppButton>
    </div>

    <label class="flex items-center gap-2 text-sm text-surface-600">
      <input v-model="showAllTeams" type="checkbox" class="h-4 w-4 rounded border-surface-300" />
      Show all teams
      <span class="text-xs text-surface-400">— include your time logged in every team you belong to, read-only</span>
    </label>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>

    <template v-else>
      <div v-for="day in days" :key="day.toISOString()">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-400">
          {{ format(day, 'EEEE, MMM d') }}
        </h2>
        <EmptyState v-if="recordsForDay(day).length === 0" title="No time logged" class="mb-4" />
        <ul v-else class="mb-4 space-y-2">
          <li
            v-for="entry in recordsForDay(day)"
            :key="entry.kind === 'own' ? entry.record._id : entry.entry.record._id"
            class="rounded-lg border border-surface-200 bg-white px-4 py-2.5"
            :class="{ 'opacity-70': entry.kind === 'other' }"
          >
            <template v-if="entry.kind === 'own'">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate font-medium text-surface-900">{{ projectName(entry.record.projectId) }}</div>
                  <div class="text-xs text-surface-500">
                    {{ formatTimeOfDay(entry.record.startTime) }}–{{ formatTimeOfDay(entry.record.endTime) }} ·
                    {{ hours(entry.record.durationMinutes) }}h
                    <span v-if="!entry.record.billable">· non-billable</span>
                  </div>
                  <p v-if="entry.record.note" class="mt-1 text-xs text-surface-600">{{ entry.record.note }}</p>
                  <p
                    v-if="entry.record.status === 'rejected' && entry.record.rejectionReason"
                    class="mt-1 text-xs text-danger-600"
                  >
                    Rejected: {{ entry.record.rejectionReason }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1">
                  <StatusPill :status="entry.record.status" />
                  <span class="text-xs text-surface-500">
                    <CurrencyDisplay :amount="entry.record.calculatedCost" :currency="entry.record.currency" />
                  </span>
                  <RateField class="text-xs" :amount="entry.record.resolvedRate" :currency="entry.record.currency" />
                </div>
              </div>
              <div v-if="!entry.record.locked" class="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  class="text-xs font-medium text-primary-600 hover:underline"
                  @click="openEdit(entry.record)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="text-xs font-medium text-danger-600 hover:underline"
                  @click="deleteTarget = entry.record"
                >
                  Delete
                </button>
              </div>
              <span v-else class="mt-2 inline-block text-xs text-surface-400">Locked (approved)</span>
            </template>
            <template v-else>
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate font-medium text-surface-900">
                    {{ entry.entry.projectName }}
                    <span class="ml-1 rounded bg-surface-100 px-1.5 py-0.5 text-xs font-normal text-surface-500">
                      {{ entry.entry.teamName }}
                    </span>
                  </div>
                  <div class="text-xs text-surface-500">
                    {{ formatTimeOfDay(entry.entry.record.startTime) }}–{{ formatTimeOfDay(entry.entry.record.endTime) }} ·
                    {{ hours(entry.entry.record.durationMinutes) }}h
                    <span v-if="!entry.entry.record.billable">· non-billable</span>
                  </div>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1">
                  <StatusPill :status="entry.entry.record.status" />
                </div>
              </div>
              <p class="mt-2 text-xs text-surface-400">From another team — view it there to edit or delete.</p>
            </template>
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
