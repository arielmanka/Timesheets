<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
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
  billable: true,
  note: '',
})

// Reload the task list whenever the selected project changes.
watch(
  () => form.projectId,
  async (projectId) => {
    form.taskId = ''
    if (projectId) await tasks.fetchAll(props.teamId, projectId)
  }
)

const { loading, run: submit } = useAsyncAction(async () => {
  await timeRecords.create(props.teamId, {
    projectId: form.projectId,
    taskId: form.taskId || null,
    // Plain yyyy-MM-dd — the backend parses date-only strings as UTC midnight,
    // so this round-trips to the same calendar date regardless of timezone.
    date: form.date,
    startTime: combineLocalDateTime(form.date, form.startTime),
    endTime: combineLocalDateTime(form.date, form.endTime),
    billable: form.billable,
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
      <select v-model="form.taskId" class="field-control" :disabled="!form.projectId">
        <option value="">No task</option>
        <option v-for="t in tasks.items" :key="t._id" :value="t._id">{{ t.name }}</option>
      </select>
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
    <FormField label="Billable">
      <label class="flex h-[38px] items-center gap-2 text-sm text-surface-700">
        <input v-model="form.billable" type="checkbox" class="h-4 w-4 rounded border-surface-300" />
        Billable
      </label>
    </FormField>

    <FormField label="Note" class="col-span-2 sm:col-span-4">
      <textarea v-model="form.note" maxlength="1000" rows="2" class="field-control" placeholder="Optional" />
    </FormField>

    <div class="col-span-2 sm:col-span-4">
      <AppButton type="submit" :loading="loading" :disabled="!form.projectId">Log time</AppButton>
    </div>
  </form>
</template>
