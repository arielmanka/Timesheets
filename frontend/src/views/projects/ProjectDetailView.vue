<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '../../stores/projects'
import { useClientsStore } from '../../stores/clients'
import { useTasksStore } from '../../stores/tasks'
import { useTeamStore } from '../../stores/team'
import { useAuthStore } from '../../stores/auth'
import * as projectsService from '../../services/projects.service'
import * as reportsService from '../../services/reports.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { Project, ProjectStatus, TaxRule } from '../../types/project'
import type { Task, TaskInput, TaskStatus } from '../../types/task'
import type { ReportSummary } from '../../types/report'
import { PROJECT_STATUSES } from '../../types/project'
import { TASK_STATUSES } from '../../types/task'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'
import Modal from '../../components/ui/Modal.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import RateField from '../../components/ui/RateField.vue'
import CurrencyDisplay from '../../components/ui/CurrencyDisplay.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const route = useRoute()
const teamId = route.params.teamId as string
const projectId = route.params.projectId as string

const projects = useProjectsStore()
const clients = useClientsStore()
const tasks = useTasksStore()
const team = useTeamStore()
const auth = useAuthStore()
const ui = useUiStore()

const project = ref<Project | null>(null)
const budgetActual = ref<ReportSummary | null>(null)

const { loading, run: load } = useAsyncAction(async () => {
  const [p] = await Promise.all([
    projectsService.getProject(teamId, projectId),
    clients.loaded ? Promise.resolve() : clients.fetchAll(teamId),
    tasks.fetchAll(teamId, projectId),
  ])
  project.value = p
  if (team.isManager && p.budget.type) {
    budgetActual.value = await reportsService.getReportSummary(teamId, { projectId })
  }
})
onMounted(load)

const clientName = computed(() => clients.items.find((c) => c._id === project.value?.clientId)?.name ?? '—')

// --- Status change -------------------------------------------------------
const { run: changeStatus } = useAsyncAction(async (status: ProjectStatus) => {
  project.value = await projects.updateStatus(teamId, projectId, status)
  ui.success('Project status updated.')
})

// --- Rate / currency / dates / budget / tax rules (manager) ---------------
const showSettings = ref(false)
const settingsForm = reactive({
  currency: '',
  hourlyRate: '' as string | number,
  startDate: '' as string | null,
  endDate: '' as string | null,
  budgetType: '' as '' | 'hours' | 'monetary',
  budgetAmount: '' as string | number,
  taxRules: [] as TaxRule[],
})

function openSettings(): void {
  if (!project.value) return
  Object.assign(settingsForm, {
    currency: project.value.currency,
    hourlyRate: project.value.hourlyRate ?? '',
    startDate: project.value.startDate?.slice(0, 10) ?? '',
    endDate: project.value.endDate?.slice(0, 10) ?? '',
    budgetType: project.value.budget.type ?? '',
    budgetAmount: project.value.budget.amount ?? '',
    taxRules: project.value.taxRules.map((t) => ({ ...t })),
  })
  showSettings.value = true
}

function addTaxRule(): void {
  settingsForm.taxRules.push({ name: '', rate: 0 })
}
function removeTaxRule(index: number): void {
  settingsForm.taxRules.splice(index, 1)
}

const { loading: savingSettings, run: saveSettings } = useAsyncAction(async () => {
  project.value = await projects.update(teamId, projectId, {
    currency: settingsForm.currency,
    hourlyRate: settingsForm.hourlyRate === '' ? null : Number(settingsForm.hourlyRate),
    startDate: settingsForm.startDate || null,
    endDate: settingsForm.endDate || null,
    budget: {
      type: settingsForm.budgetType || null,
      amount: settingsForm.budgetAmount === '' ? null : Number(settingsForm.budgetAmount),
    },
    taxRules: settingsForm.taxRules.filter((t) => t.name.trim() !== ''),
  })
  showSettings.value = false
  ui.success('Project settings saved.')
  if (team.isManager && project.value.budget.type) {
    budgetActual.value = await reportsService.getReportSummary(teamId, { projectId })
  }
})

const budgetProgress = computed(() => {
  if (!project.value?.budget.type || !budgetActual.value || !project.value.budget.amount) return null
  // Scoped to a single project, so at most one currency is expected — the
  // budget amount is denominated in the project's own currency.
  const actual =
    project.value.budget.type === 'hours'
      ? budgetActual.value.totalHours
      : (budgetActual.value.costByCurrency[0]?.totalCost ?? 0)
  const pct = Math.min(100, Math.round((actual / project.value.budget.amount) * 100))
  return { actual, target: project.value.budget.amount, pct }
})

// --- Tasks -------------------------------------------------------------
const showTaskForm = ref(false)
const editingTask = ref<Task | null>(null)
const taskForm = reactive<{ name: string; description: string; assignedTo: string | null; hourlyRate: string }>({
  name: '',
  description: '',
  assignedTo: null,
  hourlyRate: '',
})

function openCreateTask(): void {
  editingTask.value = null
  Object.assign(taskForm, { name: '', description: '', assignedTo: null, hourlyRate: '' })
  showTaskForm.value = true
}
function openEditTask(task: Task): void {
  editingTask.value = task
  Object.assign(taskForm, {
    name: task.name,
    description: task.description ?? '',
    assignedTo: task.assignedTo,
    hourlyRate: task.hourlyRate === null ? '' : String(task.hourlyRate),
  })
  showTaskForm.value = true
}
const { loading: savingTask, run: saveTask } = useAsyncAction(async () => {
  const input: TaskInput = {
    name: taskForm.name,
    description: taskForm.description || null,
    assignedTo: taskForm.assignedTo || null,
    hourlyRate: taskForm.hourlyRate === '' ? null : Number(taskForm.hourlyRate),
  }
  if (editingTask.value) {
    await tasks.update(teamId, projectId, editingTask.value._id, input)
  } else {
    await tasks.create(teamId, projectId, input)
  }
  showTaskForm.value = false
})

function canEditStatus(task: Task): boolean {
  return team.isManager || task.assignedTo === auth.user?._id
}
async function setTaskStatus(task: Task, status: TaskStatus): Promise<void> {
  await tasks.update(teamId, projectId, task._id, { status })
}
function assigneeName(userId: string | null): string {
  if (!userId) return 'Unassigned'
  const member = team.current?.members.find((m) => m.userId === userId)
  return member ? `${member.firstName} ${member.lastName}` : 'Unknown'
}
</script>

<template>
  <div v-if="loading && !project" class="text-sm text-surface-500">Loading…</div>

  <div v-else-if="project" class="max-w-3xl space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-lg font-semibold text-surface-900">{{ project.name }}</h1>
        <p class="text-sm text-surface-500">{{ clientName }} · {{ project.currency }}</p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-if="team.isManager"
          :value="project.status"
          class="field-control w-auto"
          @change="changeStatus(($event.target as HTMLSelectElement).value as ProjectStatus)"
        >
          <option v-for="s in PROJECT_STATUSES" :key="s" :value="s">{{ s.replace('_', ' ') }}</option>
        </select>
        <StatusPill v-else :status="project.status" />
        <AppButton v-if="team.isManager" variant="secondary" @click="openSettings">Settings</AppButton>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 rounded-lg border border-surface-200 bg-white p-4 text-sm sm:grid-cols-4">
      <div>
        <div class="text-xs uppercase tracking-wide text-surface-400">Start date</div>
        <div class="mt-0.5 text-surface-800">{{ project.startDate?.slice(0, 10) ?? '—' }}</div>
      </div>
      <div>
        <div class="text-xs uppercase tracking-wide text-surface-400">End date</div>
        <div class="mt-0.5 text-surface-800">{{ project.endDate?.slice(0, 10) ?? '—' }}</div>
      </div>
      <div>
        <div class="text-xs uppercase tracking-wide text-surface-400">Rate</div>
        <div class="mt-0.5"><RateField :amount="project.hourlyRate" :currency="project.currency" /></div>
      </div>
      <div>
        <div class="text-xs uppercase tracking-wide text-surface-400">Tax rules</div>
        <div class="mt-0.5 text-surface-800">
          {{ project.taxRules.length ? project.taxRules.map((t) => `${t.name} ${t.rate}%`).join(', ') : '—' }}
        </div>
      </div>
    </div>

    <div v-if="team.isManager && project.budget.type" class="rounded-lg border border-surface-200 bg-white p-4">
      <div class="mb-2 flex items-center justify-between text-sm">
        <span class="font-medium text-surface-800">
          Budget ({{ project.budget.type === 'hours' ? 'hours' : 'cost' }})
        </span>
        <span v-if="budgetProgress" class="text-surface-500 tabular-nums">
          <template v-if="project.budget.type === 'hours'">{{ budgetProgress.actual.toFixed(1) }}h / {{ budgetProgress.target }}h</template>
          <template v-else>
            <CurrencyDisplay :amount="budgetProgress.actual" :currency="project.currency" /> /
            <CurrencyDisplay :amount="budgetProgress.target" :currency="project.currency" />
          </template>
        </span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-surface-100">
        <div
          class="h-full rounded-full"
          :class="budgetProgress && budgetProgress.pct >= 100 ? 'bg-danger-500' : 'bg-primary-500'"
          :style="{ width: `${budgetProgress?.pct ?? 0}%` }"
        />
      </div>
    </div>

    <div>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-surface-800">Tasks</h2>
        <AppButton v-if="team.isManager" variant="secondary" @click="openCreateTask">New task</AppButton>
      </div>

      <EmptyState v-if="tasks.items.length === 0" title="No tasks yet" />

      <ul v-else class="space-y-2">
        <li
          v-for="task in tasks.items"
          :key="task._id"
          class="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-4 py-2.5"
        >
          <div class="min-w-0">
            <div class="truncate font-medium text-surface-900">{{ task.name }}</div>
            <div class="text-xs text-surface-500">{{ assigneeName(task.assignedTo) }}</div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <select
              v-if="canEditStatus(task)"
              :value="task.status"
              class="field-control w-auto py-1 text-xs"
              @change="setTaskStatus(task, ($event.target as HTMLSelectElement).value as TaskStatus)"
            >
              <option v-for="s in TASK_STATUSES" :key="s" :value="s">{{ s.replace('_', ' ') }}</option>
            </select>
            <StatusPill v-else :status="task.status" />
            <AppButton v-if="team.isManager" variant="ghost" @click="openEditTask(task)">Edit</AppButton>
          </div>
        </li>
      </ul>
    </div>

    <!-- Project settings modal -->
    <Modal v-if="showSettings" title="Project settings" wide @close="showSettings = false">
      <form id="project-settings-form" class="space-y-4" @submit.prevent="saveSettings">
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Currency">
            <input v-model="settingsForm.currency" maxlength="3" required class="field-control uppercase" />
          </FormField>
          <FormField label="Hourly rate" hint="Used when a task or the resolved member rate isn't set.">
            <input v-model="settingsForm.hourlyRate" type="number" step="0.01" min="0" class="field-control" />
          </FormField>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Start date">
            <input v-model="settingsForm.startDate" type="date" class="field-control" />
          </FormField>
          <FormField label="End date">
            <input v-model="settingsForm.endDate" type="date" class="field-control" />
          </FormField>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Budget type">
            <select v-model="settingsForm.budgetType" class="field-control">
              <option value="">None</option>
              <option value="hours">Hours</option>
              <option value="monetary">Monetary</option>
            </select>
          </FormField>
          <FormField label="Budget amount">
            <input v-model="settingsForm.budgetAmount" type="number" step="0.01" min="0" class="field-control" />
          </FormField>
        </div>
        <fieldset class="rounded-md border border-surface-200 p-3">
          <legend class="px-1 text-xs font-medium text-surface-500">Tax rules</legend>
          <div class="space-y-2">
            <div v-for="(rule, i) in settingsForm.taxRules" :key="i" class="flex items-center gap-2">
              <input v-model="rule.name" placeholder="e.g. VAT" class="field-control" />
              <input v-model.number="rule.rate" type="number" step="0.01" min="0" class="field-control w-24" />
              <span class="text-sm text-surface-400">%</span>
              <AppButton variant="ghost" @click="removeTaxRule(i)">Remove</AppButton>
            </div>
            <AppButton variant="secondary" @click="addTaxRule">Add tax rule</AppButton>
          </div>
        </fieldset>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showSettings = false">Cancel</AppButton>
        <AppButton form="project-settings-form" type="submit" :loading="savingSettings">Save</AppButton>
      </template>
    </Modal>

    <!-- Task form modal -->
    <Modal v-if="showTaskForm" :title="editingTask ? 'Edit task' : 'New task'" @close="showTaskForm = false">
      <form id="task-form" class="space-y-4" @submit.prevent="saveTask">
        <FormField label="Task name">
          <input v-model="taskForm.name" required class="field-control" />
        </FormField>
        <FormField label="Description">
          <textarea v-model="taskForm.description" rows="2" class="field-control" />
        </FormField>
        <FormField label="Assigned to">
          <select v-model="taskForm.assignedTo" class="field-control">
            <option :value="null">Unassigned</option>
            <option v-for="m in team.current?.members" :key="m.userId" :value="m.userId">
              {{ m.firstName }} {{ m.lastName }}
            </option>
          </select>
        </FormField>
        <FormField label="Hourly rate" hint="Overrides the project and member rate for time logged on this task.">
          <input v-model="taskForm.hourlyRate" type="number" step="0.01" min="0" class="field-control" />
        </FormField>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showTaskForm = false">Cancel</AppButton>
        <AppButton form="task-form" type="submit" :loading="savingTask">{{ editingTask ? 'Save' : 'Create' }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
