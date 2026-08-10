<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '../../stores/projects'
import { useClientsStore } from '../../stores/clients'
import { useTasksStore } from '../../stores/tasks'
import { useTeamStore } from '../../stores/team'
import * as reportsService from '../../services/reports.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import type { ReportSummary, InvoiceReportSummary } from '../../types/report'
import CurrencyDisplay from '../../components/ui/CurrencyDisplay.vue'
import StatusPill from '../../components/ui/StatusPill.vue'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'

const route = useRoute()
const teamId = route.params.teamId as string
const projects = useProjectsStore()
const clients = useClientsStore()
const tasks = useTasksStore()
const team = useTeamStore()

const activeTab = ref<'time' | 'invoices'>('time')

onMounted(async () => {
  await Promise.all([
    projects.loaded ? Promise.resolve() : projects.fetchAll(teamId),
    clients.loaded ? Promise.resolve() : clients.fetchAll(teamId),
  ])
  runReport()
})

// --- Time report ---------------------------------------------------------
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

// A project/task/user with time recorded in more than one currency (e.g.
// its project's currency was changed partway through) produces more than
// one row here — one per currency, since amounts in different currencies
// can't be summed. Sorting by name then currency keeps those rows adjacent
// instead of scattered by insertion order, so the split reads as "same
// entity, split by currency" rather than an unexplained duplicate.
const sortedByProject = computed(() =>
  [...(summary.value?.byProject ?? [])].sort((a, b) => a.projectName.localeCompare(b.projectName) || a.currency.localeCompare(b.currency))
)
const sortedByTask = computed(() =>
  [...(summary.value?.byTask ?? [])].sort(
    (a, b) => (a.taskName ?? '').localeCompare(b.taskName ?? '') || a.currency.localeCompare(b.currency)
  )
)
const sortedByUser = computed(() =>
  [...(summary.value?.byUser ?? [])].sort(
    (a, b) => memberName(a.userId).localeCompare(memberName(b.userId)) || a.currency.localeCompare(b.currency)
  )
)

const { loading: exportingCsv, run: exportCsv } = useAsyncAction(() => reportsService.downloadReportCsv(teamId, filters))
const { loading: exportingPdf, run: exportPdf } = useAsyncAction(() => reportsService.downloadReportPdf(teamId, filters))

// --- Invoice report --------------------------------------------------------
const invoiceFilters = reactive({
  startDate: '',
  endDate: '',
  clientId: '',
  status: '' as '' | 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue',
  type: '' as '' | 'personal' | 'collective',
  paid: '' as '' | 'true' | 'false',
})
const invoiceSummary = ref<InvoiceReportSummary | null>(null)

function invoiceFilterParams() {
  return {
    startDate: invoiceFilters.startDate || undefined,
    endDate: invoiceFilters.endDate || undefined,
    clientId: invoiceFilters.clientId || undefined,
    status: invoiceFilters.status || undefined,
    type: invoiceFilters.type || undefined,
    paid: invoiceFilters.paid === '' ? undefined : invoiceFilters.paid === 'true',
  }
}

const { loading: loadingInvoiceReport, run: runInvoiceReport } = useAsyncAction(async () => {
  invoiceSummary.value = await reportsService.getInvoiceReport(teamId, invoiceFilterParams())
})

const { loading: exportingInvoicesCsv, run: exportInvoicesCsv } = useAsyncAction(() =>
  reportsService.downloadInvoiceReportCsv(teamId, invoiceFilterParams())
)
const { loading: exportingInvoicesPdf, run: exportInvoicesPdf } = useAsyncAction(() =>
  reportsService.downloadInvoiceReportPdf(teamId, invoiceFilterParams())
)

watch(activeTab, (tab) => {
  if (tab === 'invoices' && !invoiceSummary.value) runInvoiceReport()
})

const statusOrder = ['draft', 'sent', 'partially_paid', 'overdue', 'paid'] as const
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold text-surface-900">Reports</h1>
      <div class="flex rounded-lg border border-surface-200 bg-white p-1 text-sm">
        <button
          type="button"
          class="rounded-md px-3 py-1.5 font-medium"
          :class="activeTab === 'time' ? 'bg-primary-500 text-white' : 'text-surface-600'"
          @click="activeTab = 'time'"
        >
          Time
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1.5 font-medium"
          :class="activeTab === 'invoices' ? 'bg-primary-500 text-white' : 'text-surface-600'"
          @click="activeTab = 'invoices'"
        >
          Invoices
        </button>
      </div>
    </div>

    <template v-if="activeTab === 'time'">
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
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div class="rounded-lg border border-surface-200 bg-white p-4">
            <div class="text-xs uppercase tracking-wide text-surface-400">Total hours</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums text-surface-900">{{ summary.totalHours }}</div>
          </div>
          <div v-for="c in summary.costByCurrency" :key="c.currency" class="rounded-lg border border-surface-200 bg-white p-4">
            <div class="text-xs uppercase tracking-wide text-surface-400">Total cost ({{ c.currency }})</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums text-surface-900">
              <CurrencyDisplay :amount="c.totalCost" :currency="c.currency" />
            </div>
          </div>
        </div>

        <div>
          <h2 class="mb-2 text-sm font-semibold text-surface-800">By project</h2>
          <p v-if="new Set(summary.byProject.map((r) => r.projectId)).size < summary.byProject.length" class="mb-2 text-xs text-surface-500">
            A project appears more than once when it has time recorded in more than one currency (amounts can't be summed across currencies).
          </p>
          <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
            <table class="w-full text-sm">
              <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
                <tr><th class="px-4 py-2 font-medium">Project</th><th class="px-4 py-2 font-medium">Currency</th><th class="px-4 py-2 text-right font-medium">Hours</th><th class="px-4 py-2 text-right font-medium">Cost</th></tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                <tr v-for="row in sortedByProject" :key="`${row.projectId}-${row.currency}`">
                  <td class="px-4 py-2">{{ row.projectName }}</td>
                  <td class="px-4 py-2 text-surface-500">{{ row.currency }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ row.hours }}</td>
                  <td class="px-4 py-2 text-right tabular-nums"><CurrencyDisplay :amount="row.cost" :currency="row.currency" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="summary.byTask.length > 0">
          <h2 class="mb-2 text-sm font-semibold text-surface-800">By task</h2>
          <p v-if="new Set(summary.byTask.map((r) => r.taskId)).size < summary.byTask.length" class="mb-2 text-xs text-surface-500">
            A task appears more than once when it has time recorded in more than one currency (amounts can't be summed across currencies).
          </p>
          <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
            <table class="w-full text-sm">
              <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
                <tr><th class="px-4 py-2 font-medium">Task</th><th class="px-4 py-2 font-medium">Currency</th><th class="px-4 py-2 text-right font-medium">Hours</th><th class="px-4 py-2 text-right font-medium">Cost</th></tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                <tr v-for="row in sortedByTask" :key="`${row.taskId ?? 'none'}-${row.currency}`">
                  <td class="px-4 py-2">{{ row.taskName ?? 'No task' }}</td>
                  <td class="px-4 py-2 text-surface-500">{{ row.currency }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ row.hours }}</td>
                  <td class="px-4 py-2 text-right tabular-nums"><CurrencyDisplay :amount="row.cost" :currency="row.currency" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="team.isManager">
          <h2 class="mb-2 text-sm font-semibold text-surface-800">By user</h2>
          <p v-if="new Set(summary.byUser.map((r) => r.userId)).size < summary.byUser.length" class="mb-2 text-xs text-surface-500">
            A user appears more than once when they have time recorded in more than one currency (amounts can't be summed across currencies).
          </p>
          <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
            <table class="w-full text-sm">
              <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
                <tr><th class="px-4 py-2 font-medium">User</th><th class="px-4 py-2 font-medium">Currency</th><th class="px-4 py-2 text-right font-medium">Hours</th><th class="px-4 py-2 text-right font-medium">Cost</th></tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                <tr v-for="row in sortedByUser" :key="`${row.userId}-${row.currency}`">
                  <td class="px-4 py-2">{{ memberName(row.userId) }}</td>
                  <td class="px-4 py-2 text-surface-500">{{ row.currency }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ row.hours }}</td>
                  <td class="px-4 py-2 text-right tabular-nums"><CurrencyDisplay :amount="row.cost" :currency="row.currency" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>

    <template v-else>
      <p v-if="!team.isManager" class="rounded-md bg-surface-100 px-3 py-2 text-sm text-surface-600">
        Showing only invoices you created. Managers see the whole team's.
      </p>

      <form class="grid grid-cols-2 gap-3 rounded-lg border border-surface-200 bg-white p-4 sm:grid-cols-3" @submit.prevent="runInvoiceReport">
        <FormField label="Start date" hint="Filters by invoice creation date.">
          <input v-model="invoiceFilters.startDate" type="date" class="field-control" />
        </FormField>
        <FormField label="End date">
          <input v-model="invoiceFilters.endDate" type="date" class="field-control" />
        </FormField>
        <FormField label="Client">
          <select v-model="invoiceFilters.clientId" class="field-control">
            <option value="">All clients</option>
            <option v-for="c in clients.items" :key="c._id" :value="c._id">{{ c.name }}</option>
          </select>
        </FormField>
        <FormField label="Status">
          <select v-model="invoiceFilters.status" class="field-control">
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partially_paid">Partially paid</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
        </FormField>
        <FormField label="Type">
          <select v-model="invoiceFilters.type" class="field-control">
            <option value="">All</option>
            <option value="personal">Personal</option>
            <option value="collective">Collective</option>
          </select>
        </FormField>
        <FormField label="Paid">
          <select v-model="invoiceFilters.paid" class="field-control">
            <option value="">All</option>
            <option value="true">Paid</option>
            <option value="false">Not paid</option>
          </select>
        </FormField>
        <div class="col-span-2 flex items-end gap-2 sm:col-span-3">
          <AppButton type="submit" :loading="loadingInvoiceReport">Apply filters</AppButton>
          <AppButton variant="secondary" :loading="exportingInvoicesCsv" @click="exportInvoicesCsv">Export CSV</AppButton>
          <AppButton variant="secondary" :loading="exportingInvoicesPdf" @click="exportInvoicesPdf">Export PDF</AppButton>
        </div>
      </form>

      <template v-if="invoiceSummary">
        <div>
          <h2 class="mb-2 text-sm font-semibold text-surface-800">Totals</h2>
          <div class="grid gap-4" :class="invoiceSummary.totalsByCurrency.length > 1 ? 'sm:grid-cols-2' : ''">
            <div
              v-for="t in invoiceSummary.totalsByCurrency"
              :key="t.currency"
              class="rounded-lg border border-surface-200 bg-white p-4"
            >
              <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-surface-400">{{ t.currency }} · {{ t.count }} invoices</div>
              <div class="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div class="text-xs text-surface-500">Invoiced</div>
                  <div class="font-semibold tabular-nums text-surface-900"><CurrencyDisplay :amount="t.totalInvoiced" :currency="t.currency" /></div>
                </div>
                <div>
                  <div class="text-xs text-surface-500">Paid</div>
                  <div class="font-semibold tabular-nums text-success-600"><CurrencyDisplay :amount="t.totalPaid" :currency="t.currency" /></div>
                </div>
                <div>
                  <div class="text-xs text-surface-500">Outstanding</div>
                  <div class="font-semibold tabular-nums text-warning-600"><CurrencyDisplay :amount="t.totalOutstanding" :currency="t.currency" /></div>
                </div>
              </div>
            </div>
          </div>
          <p v-if="invoiceSummary.totalsByCurrency.length === 0" class="text-sm text-surface-500">No invoices match these filters.</p>
        </div>

        <div v-if="Object.keys(invoiceSummary.countByStatus).length > 0">
          <h2 class="mb-2 text-sm font-semibold text-surface-800">By status</h2>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="status in statusOrder.filter((s) => invoiceSummary!.countByStatus[s])"
              :key="status"
              class="flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm"
            >
              <StatusPill :status="status" />
              <span class="tabular-nums text-surface-600">{{ invoiceSummary.countByStatus[status] }}</span>
            </div>
          </div>
        </div>

        <div v-if="invoiceSummary.byClient.length > 0">
          <h2 class="mb-2 text-sm font-semibold text-surface-800">By client</h2>
          <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
            <table class="w-full text-sm">
              <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
                <tr>
                  <th class="px-4 py-2 font-medium">Client</th>
                  <th class="px-4 py-2 text-right font-medium">Invoiced</th>
                  <th class="px-4 py-2 text-right font-medium">Paid</th>
                  <th class="px-4 py-2 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                <tr v-for="row in invoiceSummary.byClient" :key="`${row.clientId}-${row.currency}`">
                  <td class="px-4 py-2">{{ row.clientName }} <span class="text-xs text-surface-400">({{ row.currency }})</span></td>
                  <td class="px-4 py-2 text-right tabular-nums"><CurrencyDisplay :amount="row.totalInvoiced" :currency="row.currency" /></td>
                  <td class="px-4 py-2 text-right tabular-nums text-success-600"><CurrencyDisplay :amount="row.totalPaid" :currency="row.currency" /></td>
                  <td class="px-4 py-2 text-right tabular-nums text-warning-600"><CurrencyDisplay :amount="row.totalOutstanding" :currency="row.currency" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 class="mb-2 text-sm font-semibold text-surface-800">Invoices</h2>
          <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
            <table class="w-full text-sm">
              <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
                <tr>
                  <th class="px-4 py-2 font-medium">Invoice</th>
                  <th class="px-4 py-2 font-medium">Client</th>
                  <th class="px-4 py-2 font-medium">Type</th>
                  <th class="px-4 py-2 font-medium">Status</th>
                  <th class="px-4 py-2 text-right font-medium">Total</th>
                  <th class="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                <tr v-for="inv in invoiceSummary.invoices" :key="inv._id">
                  <td class="px-4 py-2">
                    <router-link
                      :to="{ name: 'invoice-detail', params: { teamId, invoiceId: inv._id } }"
                      class="font-medium text-primary-600 hover:underline"
                    >
                      {{ inv.invoiceNumber }}
                    </router-link>
                  </td>
                  <td class="px-4 py-2">{{ inv.clientName }}</td>
                  <td class="px-4 py-2 capitalize">{{ inv.type }}</td>
                  <td class="px-4 py-2"><StatusPill :status="inv.status" /></td>
                  <td class="px-4 py-2 text-right tabular-nums"><CurrencyDisplay :amount="inv.total" :currency="inv.currency" /></td>
                  <td class="px-4 py-2 text-surface-500">{{ inv.createdAt.slice(0, 10) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="invoiceSummary.invoices.length === 0" class="px-4 py-6 text-center text-sm text-surface-500">
              No invoices match these filters.
            </p>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
