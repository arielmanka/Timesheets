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

// A project only belongs in the "new invoice" picker while it has approved,
// billable, un-invoiced time left to bill — regardless of the project's own
// status. Completing a project is often exactly when its last invoice gets
// created, so this is never gated on status directly, only on whether
// there's still something eligible to invoice.
const eligibleProjectIds = ref<Set<string>>(new Set())

async function refreshEligibleProjects(): Promise<void> {
  const records = await timeRecordsService.listTimeRecords(teamId, {
    userId: auth.user?._id,
    billable: true,
    invoiced: false,
    status: 'approved',
  })
  eligibleProjectIds.value = new Set(records.map((r) => r.projectId))
}

const { loading, run: load } = useAsyncAction(async () => {
  await Promise.all([
    invoices.fetchAll(teamId, { createdBy: auth.user?._id }),
    projects.loaded ? Promise.resolve() : projects.fetchAll(teamId),
    refreshEligibleProjects(),
  ])
})
onMounted(load)

const myInvoices = computed(() => invoices.items.filter((i) => i.type === 'personal' && i.createdBy === auth.user?._id))
const eligibleProjects = computed(() => projects.items.filter((p) => eligibleProjectIds.value.has(p._id)))

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
const taxName = ref('')
const taxRate = ref<number | null>(null)
const dueDate = ref('')
const paymentTerms = ref('')
const taxNote = ref('')

function openWizard(): void {
  step.value = 1
  selectedProjectId.value = ''
  eligibleRecords.value = []
  selectedRecordIds.value = new Set()
  notes.value = ''
  manualItems.value = []
  taxName.value = ''
  taxRate.value = null
  dueDate.value = ''
  paymentTerms.value = ''
  taxNote.value = ''
  showWizard.value = true
}

const subtotalPreview = computed(() => {
  const recordsTotal = eligibleRecords.value
    .filter((r) => selectedRecordIds.value.has(r._id))
    .reduce((sum, r) => sum + r.calculatedCost, 0)
  const manualTotal = manualItems.value.reduce((sum, m) => sum + (m.amount || 0), 0)
  return Math.round((recordsTotal + manualTotal) * 100) / 100
})
const taxPreview = computed(() => Math.round(subtotalPreview.value * ((taxRate.value ?? 0) / 100) * 100) / 100)
const grossPreview = computed(() => Math.round((subtotalPreview.value + taxPreview.value) * 100) / 100)
const previewCurrency = computed(() => eligibleRecords.value[0]?.currency ?? '')

function applyTaxPreset(name: string): void {
  taxName.value = name
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
    // taxRate.value !== null, not a truthy check — 0% is a legitimate rate
    // (e.g. an EU reverse-charge or exempt invoice) and must still be sent.
    taxRules: taxName.value.trim() && taxRate.value !== null ? [{ name: taxName.value.trim(), rate: taxRate.value }] : [],
    dueDate: dueDate.value || null,
    paymentTerms: paymentTerms.value || null,
    taxNote: taxNote.value || null,
  })
  ui.success(`Invoice #${invoice.invoiceNumber} created as a draft.`)
  showWizard.value = false
  // That project may now have nothing left to invoice — drop it from the
  // picker immediately rather than waiting for a reload to notice.
  await refreshEligibleProjects()
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
        <EmptyState
          v-if="eligibleProjects.length === 0"
          title="Nothing to invoice right now"
          message="No project has approved, billable, un-invoiced time on it — once one does, it'll show up here."
        />
        <FormField v-else label="Project">
          <select v-model="selectedProjectId" required class="field-control">
            <option value="" disabled>Select a project</option>
            <option v-for="p in eligibleProjects" :key="p._id" :value="p._id">{{ p.name }}</option>
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

        <div class="grid grid-cols-2 gap-3">
          <FormField label="Due date">
            <input v-model="dueDate" type="date" class="field-control" />
          </FormField>
          <FormField label="Payment terms" hint="e.g. Net 30">
            <input v-model="paymentTerms" class="field-control" placeholder="Optional" />
          </FormField>
        </div>

        <FormField label="Tax note" hint="e.g. reverse charge or exemption reference for EU intra-community transactions.">
          <textarea v-model="taxNote" rows="2" class="field-control" placeholder="Optional" />
        </FormField>

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

        <fieldset class="rounded-md border border-surface-200 p-3">
          <legend class="px-1 text-xs font-medium text-surface-500">Tax</legend>
          <div class="space-y-2">
            <div class="flex gap-2">
              <button
                v-for="preset in ['VAT', 'GST', 'HST']"
                :key="preset"
                type="button"
                class="rounded border border-surface-300 px-2 py-1 text-xs text-surface-600 hover:border-primary-300"
                @click="applyTaxPreset(preset)"
              >
                {{ preset }}
              </button>
            </div>
            <div class="flex items-center gap-2">
              <input v-model="taxName" placeholder="Tax name (e.g. VAT)" class="field-control" />
              <input
                v-model.number="taxRate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="Rate %"
                class="field-control w-28"
              />
            </div>
          </div>
        </fieldset>

        <div class="rounded-md bg-surface-50 p-3 text-sm">
          <div class="flex justify-between text-surface-600">
            <span>Subtotal</span>
            <span class="tabular-nums">{{ previewCurrency }} {{ subtotalPreview.toFixed(2) }}</span>
          </div>
          <div v-if="taxRate !== null" class="flex justify-between text-surface-600">
            <span>{{ taxName || 'Tax' }} ({{ taxRate }}%)</span>
            <span class="tabular-nums">{{ previewCurrency }} {{ taxPreview.toFixed(2) }}</span>
          </div>
          <div class="mt-1 flex justify-between border-t border-surface-200 pt-1 font-semibold text-surface-900">
            <span>Total</span>
            <span class="tabular-nums">{{ previewCurrency }} {{ grossPreview.toFixed(2) }}</span>
          </div>
        </div>
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
