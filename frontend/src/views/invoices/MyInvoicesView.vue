<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useInvoicesStore } from '../../stores/invoices'
import { useProjectsStore } from '../../stores/projects'
import { useAuthStore } from '../../stores/auth'
import * as timeRecordsService from '../../services/timeRecords.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { TimeRecord } from '../../types/timeRecord'
import type { ManualItemInput } from '../../types/invoice'
import StatusPill from '../../components/ui/StatusPill.vue'
import CurrencyDisplay from '../../components/ui/CurrencyDisplay.vue'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'
import Modal from '../../components/ui/Modal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const route = useRoute()
const teamId = route.params.teamId as string
const invoices = useInvoicesStore()
const projects = useProjectsStore()
const auth = useAuthStore()
const ui = useUiStore()

const { loading, run: load } = useAsyncAction(async () => {
  await Promise.all([
    invoices.fetchAll(teamId, { createdBy: auth.user?._id }),
    projects.loaded ? Promise.resolve() : projects.fetchAll(teamId),
  ])
})
onMounted(load)

const myInvoices = computed(() => invoices.items.filter((i) => i.type === 'personal' && i.createdBy === auth.user?._id))

function projectName(projectId: string | null): string {
  if (!projectId) return 'Unknown project'
  return projects.items.find((p) => p._id === projectId)?.name ?? 'Unknown project'
}

// --- New invoice wizard --------------------------------------------------
const showWizard = ref(false)
const step = ref<1 | 2>(1)
const selectedProjectId = ref('')
const eligibleRecords = ref<TimeRecord[]>([])
const selectedRecordIds = ref<Set<string>>(new Set())
const notes = ref('')
const manualItems = ref<ManualItemInput[]>([])

function openWizard(): void {
  step.value = 1
  selectedProjectId.value = ''
  eligibleRecords.value = []
  selectedRecordIds.value = new Set()
  notes.value = ''
  manualItems.value = []
  showWizard.value = true
}

const { loading: loadingEligible, run: goToStep2 } = useAsyncAction(async () => {
  eligibleRecords.value = await timeRecordsService.listTimeRecords(teamId, {
    projectId: selectedProjectId.value,
    userId: auth.user?._id,
    billable: true,
    invoiced: false,
    status: 'approved',
  })
  selectedRecordIds.value = new Set(eligibleRecords.value.map((r) => r._id))
  step.value = 2
})

function toggleRecord(id: string): void {
  if (selectedRecordIds.value.has(id)) selectedRecordIds.value.delete(id)
  else selectedRecordIds.value.add(id)
}

function addManualItem(): void {
  manualItems.value.push({ description: '', amount: 0 })
}
function removeManualItem(i: number): void {
  manualItems.value.splice(i, 1)
}

const { loading: creating, run: createInvoice } = useAsyncAction(async () => {
  const invoice = await invoices.createPersonal(teamId, {
    projectId: selectedProjectId.value,
    timeRecordIds: Array.from(selectedRecordIds.value),
    notes: notes.value || null,
    manualItems: manualItems.value.filter((m) => m.description.trim() !== ''),
  })
  ui.success(`Invoice #${invoice.invoiceNumber} created as a draft.`)
  showWizard.value = false
})
</script>

<template>
  <div>
    <div class="mb-5 flex items-center justify-between">
      <h1 class="text-lg font-semibold text-surface-900">My invoices</h1>
      <AppButton @click="openWizard">New invoice</AppButton>
    </div>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>
    <EmptyState
      v-else-if="myInvoices.length === 0"
      title="No invoices yet"
      message="Bill your approved, billable time to a client by creating a personal invoice."
    />

    <ul v-else class="space-y-2">
      <li v-for="invoice in myInvoices" :key="invoice._id">
        <router-link
          :to="{ name: 'invoice-detail', params: { teamId, invoiceId: invoice._id } }"
          class="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-4 py-3 hover:border-primary-300"
        >
          <div>
            <div class="font-medium text-surface-900">#{{ invoice.invoiceNumber }} · {{ projectName(invoice.projectId) }}</div>
            <div class="text-xs text-surface-500"><CurrencyDisplay :amount="invoice.total" :currency="invoice.currency" /></div>
          </div>
          <StatusPill :status="invoice.status" />
        </router-link>
      </li>
    </ul>

    <Modal v-if="showWizard" title="New personal invoice" wide @close="showWizard = false">
      <div v-if="step === 1" class="space-y-4">
        <FormField label="Project">
          <select v-model="selectedProjectId" required class="field-control">
            <option value="" disabled>Select a project</option>
            <option v-for="p in projects.items" :key="p._id" :value="p._id">{{ p.name }}</option>
          </select>
        </FormField>
      </div>

      <div v-else class="space-y-4">
        <p v-if="eligibleRecords.length === 0" class="text-sm text-surface-500">
          No approved, un-invoiced billable time on this project.
        </p>
        <ul v-else class="max-h-56 space-y-1 overflow-y-auto rounded-md border border-surface-200 p-2">
          <li v-for="r in eligibleRecords" :key="r._id" class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              :checked="selectedRecordIds.has(r._id)"
              class="h-4 w-4 rounded border-surface-300"
              @change="toggleRecord(r._id)"
            />
            <span class="text-surface-700">
              {{ r.date.slice(0, 10) }} · {{ (r.durationMinutes / 60).toFixed(2) }}h ·
              <CurrencyDisplay :amount="r.calculatedCost" :currency="r.currency" />
            </span>
          </li>
        </ul>

        <FormField label="Notes">
          <textarea v-model="notes" rows="2" class="field-control" placeholder="Optional" />
        </FormField>

        <fieldset class="rounded-md border border-surface-200 p-3">
          <legend class="px-1 text-xs font-medium text-surface-500">Manual items</legend>
          <div class="space-y-2">
            <div v-for="(item, i) in manualItems" :key="i" class="flex items-center gap-2">
              <input v-model="item.description" placeholder="Description" class="field-control" />
              <input v-model.number="item.amount" type="number" step="0.01" class="field-control w-28" />
              <AppButton variant="ghost" @click="removeManualItem(i)">Remove</AppButton>
            </div>
            <AppButton variant="secondary" @click="addManualItem">Add item</AppButton>
          </div>
        </fieldset>
      </div>

      <template #footer>
        <AppButton variant="secondary" @click="showWizard = false">Cancel</AppButton>
        <AppButton v-if="step === 1" :disabled="!selectedProjectId" :loading="loadingEligible" @click="goToStep2">
          Next
        </AppButton>
        <AppButton v-else :disabled="selectedRecordIds.size === 0" :loading="creating" @click="createInvoice">
          Create draft
        </AppButton>
      </template>
    </Modal>
  </div>
</template>
