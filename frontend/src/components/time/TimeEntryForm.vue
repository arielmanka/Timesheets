<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { VueDatePicker } from '@vuepic/vue-datepicker'
import { useProjectsStore } from '../../stores/projects'
import { useTasksStore } from '../../stores/tasks'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useTimeRecordsStore } from '../../stores/timeRecords'
import { useUiStore } from '../../stores/ui'
import { combineLocalDateTime, todayLocalDate } from '../../utils/datetime'
import FormField from '../ui/FormField.vue'
import AppButton from '../ui/AppButton.vue'

const props = defineProps<{ teamId: string }>()

const projects = useProjectsStore()
const tasks = useTasksStore()
const timeRecords = useTimeRecordsStore()
const ui = useUiStore()

const activeProjects = computed(() => projects.items.filter((p) => p.status === 'active'))

const form = reactive({
  projectId: '',
  taskId: '' as string,
  date: todayLocalDate(),
  startTime: '09:00',
  endTime: '17:00',
  note: '',
})

const tasksLoaded = ref(false)

// Reload the task list whenever the selected project changes.
watch(
  () => form.projectId,
  async (projectId) => {
    form.taskId = ''
    tasksLoaded.value = false
    if (projectId) {
      await tasks.fetchAll(props.teamId, projectId)
      tasksLoaded.value = true
    }
  }
)

// A completed task can't take new time (see timeRecord.service.ts's
// TASK_COMPLETE check) — a task is required, and its billable setting is
// what the logged time inherits (see Task.billable), so there's nothing
// left to choose beyond which open/in-progress task this is for.
const selectableTasks = computed(() => tasks.items.filter((t) => t.status !== 'complete'))
const selectedTask = computed(() => selectableTasks.value.find((t) => t._id === form.taskId))
const noTasksAvailable = computed(() => form.projectId !== '' && tasksLoaded.value && selectableTasks.value.length === 0)

const { loading, run: submit } = useAsyncAction(async () => {
  await timeRecords.create(props.teamId, {
    projectId: form.projectId,
    taskId: form.taskId,
    // Plain yyyy-MM-dd — the backend parses date-only strings as UTC midnight,
    // so this round-trips to the same calendar date regardless of timezone.
    date: form.date,
    startTime: combineLocalDateTime(form.date, form.startTime),
    endTime: combineLocalDateTime(form.date, form.endTime),
    note: form.note || undefined,
  })

  ui.success('Time logged.')
  form.note = ''
})
</script>

<template>
  <form class="grid grid-cols-2 gap-3 sm:grid-cols-4" @submit.prevent="submit">
    <FormField label="Project" class="col-span-2">
      <select v-model="form.projectId" required class="field-control">
        <option value="" disabled>Select a project</option>
        <option v-for="p in activeProjects" :key="p._id" :value="p._id">{{ p.name }}</option>
      </select>
    </FormField>
    <FormField label="Task" class="col-span-2">
      <select v-model="form.taskId" required class="field-control" :disabled="!form.projectId || noTasksAvailable">
        <option value="" disabled>Select a task</option>
        <option v-for="t in selectableTasks" :key="t._id" :value="t._id">{{ t.name }}</option>
      </select>
      <p v-if="noTasksAvailable" class="mt-1 text-xs text-warning-600">
        This project has no open tasks — ask a manager to create one, or reopen an existing one, before logging time.
      </p>
    </FormField>

    <FormField label="Date">
      <VueDatePicker
        v-model="form.date"
        model-type="yyyy-MM-dd"
        format="yyyy-MM-dd"
        :enable-time-picker="false"
        :clearable="false"
        auto-apply
      />
    </FormField>
    <FormField label="Start">
      <VueDatePicker v-model="form.startTime" model-type="HH:mm" time-picker :clearable="false" auto-apply />
    </FormField>
    <FormField label="End">
      <VueDatePicker v-model="form.endTime" model-type="HH:mm" time-picker :clearable="false" auto-apply />
    </FormField>
    <FormField label="Billable" hint="Set on the task — see your manager to change it.">
      <div class="flex h-[38px] items-center">
        <span
          v-if="selectedTask"
          class="rounded px-2 py-1 text-xs font-medium uppercase tracking-wide"
          :class="selectedTask.billable ? 'bg-primary-500/10 text-primary-700' : 'bg-surface-100 text-surface-500'"
        >
          {{ selectedTask.billable ? 'Billable' : 'Non-billable' }}
        </span>
        <span v-else class="text-sm text-surface-400">Select a task</span>
      </div>
    </FormField>

    <FormField label="Note" class="col-span-2 sm:col-span-4">
      <textarea v-model="form.note" maxlength="1000" rows="2" class="field-control" placeholder="Optional" />
    </FormField>

    <div class="col-span-2 sm:col-span-4">
      <AppButton type="submit" :loading="loading" :disabled="!form.projectId || !form.taskId">Log time</AppButton>
    </div>
  </form>
</template>
