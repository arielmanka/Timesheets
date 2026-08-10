<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '../../stores/projects'
import { useClientsStore } from '../../stores/clients'
import { useTasksStore } from '../../stores/tasks'
import { useTeamStore } from '../../stores/team'
import * as reportsService from '../../services/reports.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import type { ReportSummary } from '../../types/report'
import CurrencyDisplay from '../../components/ui/CurrencyDisplay.vue'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'

const route = useRoute()
const teamId = route.params.teamId as string
const projects = useProjectsStore()
const clients = useClientsStore()
const tasks = useTasksStore()
const team = useTeamStore()

const filters = reactive({ startDate: '', endDate: '', userId: '', projectId: '', clientId: '', taskId: '' })
const summary = ref<ReportSummary | null>(null)

const { loading, run: runReport } = useAsyncAction(async () => {
  summary.value = await reportsService.getReportSummary(teamId, {
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    userId: filters.userId || undefined,
    projectId: filters.projectId || undefined,
    clientId: filters.clientId || undefined,
    taskId: filters.taskId || undefined,
  })
})

onMounted(async () => {
  await Promise.all([
    projects.loaded ? Promise.resolve() : projects.fetchAll(teamId),
    clients.loaded ? Promise.resolve() : clients.fetchAll(teamId),
  ])
  runReport()
})

watch(
  () => filters.projectId,
  async (projectId) => {
    filters.taskId = ''
    if (projectId) await tasks.fetchAll(teamId, projectId)
  }
)

function memberName(userId: string): string {
  const m = team.current?.members.find((mm) => mm.userId === userId)
  return m ? `${m.firstName} ${m.lastName}` : userId
}

const { loading: exportingCsv, run: exportCsv } = useAsyncAction(() => reportsService.downloadReportCsv(teamId, filters))
const { loading: exportingPdf, run: exportPdf } = useAsyncAction(() => reportsService.downloadReportPdf(teamId, filters))
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <h1 class="text-lg font-semibold text-surface-900">Reports</h1>

    <form class="grid grid-cols-2 gap-3 rounded-lg border border-surface-200 bg-white p-4 sm:grid-cols-3" @submit.prevent="runReport">
      <FormField label="Start date">
        <input v-model="filters.startDate" type="date" class="field-control" />
      </FormField>
      <FormField label="End date">
        <input v-model="filters.endDate" type="date" class="field-control" />
      </FormField>
      <FormField v-if="team.isManager" label="User">
        <select v-model="filters.userId" class="field-control">
          <option value="">Everyone</option>
          <option v-for="m in team.current?.members" :key="m.userId" :value="m.userId">{{ m.firstName }} {{ m.lastName }}</option>
        </select>
      </FormField>
      <FormField label="Client">
        <select v-model="filters.clientId" class="field-control">
          <option value="">All clients</option>
          <option v-for="c in clients.items" :key="c._id" :value="c._id">{{ c.name }}</option>
        </select>
      </FormField>
      <FormField label="Project">
        <select v-model="filters.projectId" class="field-control">
          <option value="">All projects</option>
          <option v-for="p in projects.items" :key="p._id" :value="p._id">{{ p.name }}</option>
        </select>
      </FormField>
      <FormField label="Task">
        <select v-model="filters.taskId" class="field-control" :disabled="!filters.projectId">
          <option value="">All tasks</option>
          <option v-for="t in tasks.items" :key="t._id" :value="t._id">{{ t.name }}</option>
        </select>
      </FormField>
      <div class="col-span-2 flex items-end gap-2 sm:col-span-3">
        <AppButton type="submit" :loading="loading">Apply filters</AppButton>
        <AppButton variant="secondary" :loading="exportingCsv" @click="exportCsv">Export CSV</AppButton>
        <AppButton variant="secondary" :loading="exportingPdf" @click="exportPdf">Export PDF</AppButton>
      </div>
    </form>

    <template v-if="summary">
      <div class="grid grid-cols-2 gap-4">
        <div class="rounded-lg border border-surface-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-surface-400">Total hours</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-surface-900">{{ summary.totalHours }}</div>
        </div>
        <div class="rounded-lg border border-surface-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-surface-400">Total cost</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-surface-900">
            <CurrencyDisplay :amount="summary.totalCost" :currency="summary.currency" />
          </div>
        </div>
      </div>

      <div>
        <h2 class="mb-2 text-sm font-semibold text-surface-800">By project</h2>
        <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
          <table class="w-full text-sm">
            <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
              <tr><th class="px-4 py-2 font-medium">Project</th><th class="px-4 py-2 text-right font-medium">Hours</th><th class="px-4 py-2 text-right font-medium">Cost</th></tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              <tr v-for="row in summary.byProject" :key="row.projectId">
                <td class="px-4 py-2">{{ row.projectName }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ row.hours }}</td>
                <td class="px-4 py-2 text-right tabular-nums"><CurrencyDisplay :amount="row.cost" :currency="summary.currency" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="team.isManager">
        <h2 class="mb-2 text-sm font-semibold text-surface-800">By user</h2>
        <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
          <table class="w-full text-sm">
            <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
              <tr><th class="px-4 py-2 font-medium">User</th><th class="px-4 py-2 text-right font-medium">Hours</th><th class="px-4 py-2 text-right font-medium">Cost</th></tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              <tr v-for="row in summary.byUser" :key="row.userId">
                <td class="px-4 py-2">{{ memberName(row.userId) }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ row.hours }}</td>
                <td class="px-4 py-2 text-right tabular-nums"><CurrencyDisplay :amount="row.cost" :currency="summary.currency" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
