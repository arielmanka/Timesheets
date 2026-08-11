<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInvoicesStore } from '../../stores/invoices'
import { useProjectsStore } from '../../stores/projects'
import { useClientsStore } from '../../stores/clients'
import { useTeamStore } from '../../stores/team'
import { useAuthStore } from '../../stores/auth'
import * as invoicesService from '../../services/invoices.service'
import * as timeRecordsService from '../../services/timeRecords.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { Invoice, ManualItemInput } from '../../types/invoice'
import type { TimeRecord } from '../../types/timeRecord'
import { todayLocalDate } from '../../utils/datetime'
import StatusPill from '../../components/ui/StatusPill.vue'
import CurrencyDisplay from '../../components/ui/CurrencyDisplay.vue'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'
import Modal from '../../components/ui/Modal.vue'
import ConfirmDialog from '../../components/ui/ConfirmDialog.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const teamId = route.params.teamId as string
const invoiceId = route.params.invoiceId as string

const invoices = useInvoicesStore()
const projects = useProjectsStore()
const clients = useClientsStore()
const team = useTeamStore()
const auth = useAuthStore()
const ui = useUiStore()

const invoice = ref<Invoice | null>(null)
const poolInvoice = ref<Invoice | null>(null)

const { loading, run: load } = useAsyncAction(async () => {
  const [inv] = await Promise.all([
    invoicesService.getInvoice(teamId, invoiceId),
    projects.loaded ? Promise.resolve() : projects.fetchAll(teamId),
    clients.loaded ? Promise.resolve() : clients.fetchAll(teamId),
  ])
  invoice.value = inv

  poolInvoice.value = inv.includedInCollectiveInvoiceId
    ? await invoicesService.getInvoice(teamId, inv.includedInCollectiveInvoiceId)
    : null

  if (inv.status === 'draft' && inv.type === 'personal' && inv.createdBy === auth.user?._id) {
    await loadEligibleTimeRecords()
  }
  if (inv.status === 'draft' && inv.type === 'collective' && team.isManager) {
    await loadEligiblePersonalInvoices()
  }
})
onMounted(load)

const projectName = computed(() => projects.items.find((p) => p._id === invoice.value?.projectId)?.name ?? null)
const client = computed(() => clients.items.find((c) => c._id === invoice.value?.clientId) ?? null)
const preparerName = computed(() => {
  const m = team.current?.members.find((mm) => mm.userId === invoice.value?.createdBy)
  return m ? `${m.firstName} ${m.lastName}` : '—'
})
const isDraft = computed(() => invoice.value?.status === 'draft')
const isOwnPersonalDraft = computed(
  () => isDraft.value && invoice.value?.type === 'personal' && invoice.value?.createdBy === auth.user?._id
)
const isManagedCollectiveDraft = computed(
  () => isDraft.value && invoice.value?.type === 'collective' && team.isManager
)
// A sent personal invoice can go back to draft — but only its owner or a
// manager, and only while it hasn't been pulled into a collective invoice's
// pool (that pool is relying on it staying sent).
const canRevertToDraft = computed(
  () =>
    invoice.value?.type === 'personal' &&
    invoice.value?.status === 'sent' &&
    !invoice.value?.includedInCollectiveInvoiceId &&
    (invoice.value?.createdBy === auth.user?._id || team.isManager)
)
// Derived pool-status label — never stored on the invoice's own `status`.
const poolStatusLabel = computed(() => {
  if (!invoice.value?.includedInCollectiveInvoiceId || !poolInvoice.value) return null
  return poolInvoice.value.status === 'draft' ? 'In pool (draft)' : 'In pool (sent)'
})

// --- Add / remove time entries on a draft personal invoice (INV-5) --------
const eligibleTimeRecords = ref<TimeRecord[]>([])
async function loadEligibleTimeRecords(): Promise<void> {
  if (!invoice.value?.projectId) return
  eligibleTimeRecords.value = await timeRecordsService.listTimeRecords(teamId, {
    projectId: invoice.value.projectId,
    userId: auth.user?._id,
    billable: true,
    invoiced: false,
    status: 'approved',
  })
}
const { loading: addingRecord, run: handleAddTimeRecord } = useAsyncAction(async (recordId: string) => {
  if (!invoice.value) return
  invoice.value = await invoices.addTimeRecord(teamId, invoiceId, recordId)
  await loadEligibleTimeRecords()
  ui.success('Time entry added.')
})
const { loading: removingRecord, run: handleRemoveTimeRecord } = useAsyncAction(async (recordId: string) => {
  if (!invoice.value) return
  invoice.value = await invoices.removeTimeRecord(teamId, invoiceId, recordId)
  await loadEligibleTimeRecords()
  ui.success('Time entry removed.')
})

// --- Add / remove personal invoices on a draft collective invoice's pool ---
const eligiblePersonalInvoices = ref<Invoice[]>([])
async function loadEligiblePersonalInvoices(): Promise<void> {
  if (!invoice.value) return
  eligiblePersonalInvoices.value = await invoicesService.listInvoices(teamId, {
    clientId: invoice.value.clientId,
    type: 'personal',
    status: 'sent',
    unpooled: true,
  })
}
const { loading: poolingInvoice, run: handleAddToPool } = useAsyncAction(async (personalInvoiceId: string) => {
  invoice.value = await invoices.addToPool(teamId, invoiceId, personalInvoiceId)
  await loadEligiblePersonalInvoices()
  ui.success('Added to pool.')
})
const { loading: unpoolingInvoice, run: handleRemoveFromPool } = useAsyncAction(async (personalInvoiceId: string) => {
  invoice.value = await invoices.removeFromPool(teamId, invoiceId, personalInvoiceId)
  await loadEligiblePersonalInvoices()
  ui.success('Removed from pool.')
})

// --- Edit draft (notes / manual items / tax) --------------------------------
const showEdit = ref(false)
const editNotes = ref('')
const editManualItems = ref<ManualItemInput[]>([])
const editTaxName = ref('')
const editTaxRate = ref<number | null>(null)
const editDueDate = ref('')
const editPaymentTerms = ref('')
const editTaxNote = ref('')
function openEdit(): void {
  if (!invoice.value) return
  editNotes.value = invoice.value.notes ?? ''
  editManualItems.value = invoice.value.manualItems.map((m) => ({ ...m }))
  const currentTax = invoice.value.taxes[0]
  editTaxName.value = currentTax?.name ?? ''
  editTaxRate.value = currentTax?.rate ?? null
  editDueDate.value = invoice.value.dueDate?.slice(0, 10) ?? ''
  editPaymentTerms.value = invoice.value.paymentTerms ?? ''
  editTaxNote.value = invoice.value.taxNote ?? ''
  showEdit.value = true
}
function addManualItem(): void {
  editManualItems.value.push({ description: '', amount: 0 })
}
function removeManualItem(i: number): void {
  editManualItems.value.splice(i, 1)
}
const { loading: saving, run: saveEdit } = useAsyncAction(async () => {
  // A collective invoice has no tax rate of its own — each pooled personal
  // invoice keeps the one its owner charged — so taxRules only applies here
  // for a personal invoice draft.
  const isPersonal = invoice.value?.type === 'personal'
  invoice.value = await invoices.updateDraft(teamId, invoiceId, {
    notes: editNotes.value || null,
    manualItems: editManualItems.value.filter((m) => m.description.trim() !== ''),
    // editTaxRate.value !== null, not a truthy check — 0% is a legitimate
    // rate (e.g. an EU reverse-charge or exempt invoice) and must be kept.
    ...(isPersonal
      ? { taxRules: editTaxName.value.trim() && editTaxRate.value !== null ? [{ name: editTaxName.value.trim(), rate: editTaxRate.value }] : [] }
      : {}),
    dueDate: editDueDate.value || null,
    paymentTerms: editPaymentTerms.value || null,
    taxNote: editTaxNote.value || null,
  })
  showEdit.value = false
  ui.success('Draft updated.')
})

// --- Delete draft ------------------------------------------------------------
const showDeleteConfirm = ref(false)
const { loading: deleting, run: deleteDraft } = useAsyncAction(async () => {
  const wasCollective = invoice.value?.type === 'collective'
  await invoices.remove(teamId, invoiceId)
  ui.success('Draft deleted.')
  router.push({ name: wasCollective ? 'invoicing-pool' : 'invoices' })
})

// --- Send ------------------------------------------------------------------
const { loading: sending, run: send } = useAsyncAction(async () => {
  invoice.value = await invoices.send(teamId, invoiceId)
  ui.success('Invoice sent.')
})

// --- Revert to draft ---------------------------------------------------
const showRevertConfirm = ref(false)
const { loading: reverting, run: revertToDraft } = useAsyncAction(async () => {
  invoice.value = await invoices.revertToDraft(teamId, invoiceId)
  showRevertConfirm.value = false
  ui.success('Reverted to draft.')
})

// --- Record payment ----------------------------------------------------
const showPayment = ref(false)
const paymentAmount = ref('')
const paymentDate = ref(todayLocalDate())
const { loading: recordingPayment, run: recordPayment } = useAsyncAction(async () => {
  invoice.value = await invoices.recordPayment(teamId, invoiceId, Number(paymentAmount.value), paymentDate.value)
  showPayment.value = false
  ui.success('Payment recorded.')
})

// --- Export -----------------------------------------------------------
const { loading: exportingPdf, run: exportPdf } = useAsyncAction(async () => {
  if (!invoice.value) return
  await invoicesService.downloadInvoicePdf(teamId, invoiceId, invoice.value.invoiceNumber)
})
const { loading: exportingCsv, run: exportCsv } = useAsyncAction(async () => {
  if (!invoice.value) return
  await invoicesService.downloadInvoiceCsv(teamId, invoiceId, invoice.value.invoiceNumber)
})
</script>

<template>
  <div v-if="loading && !invoice" class="text-sm text-surface-500">Loading…</div>

  <div v-else-if="invoice" class="max-w-2xl space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-lg font-semibold text-surface-900">
          Invoice #{{ invoice.invoiceNumber }}
          <span class="ml-1 text-sm font-normal capitalize text-surface-400">({{ invoice.type }})</span>
        </h1>
        <p v-if="projectName" class="text-sm text-surface-500">{{ projectName }}</p>
      </div>
      <div class="flex flex-col items-end gap-1">
        <StatusPill :status="invoice.status" />
        <span v-if="poolStatusLabel" class="text-xs text-surface-500">{{ poolStatusLabel }}</span>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 rounded-lg border border-surface-200 bg-white p-4 text-sm sm:grid-cols-3">
      <div>
        <div class="text-xs uppercase tracking-wide text-surface-400">Bill to</div>
        <div class="mt-0.5 font-medium text-surface-900">{{ client?.name ?? 'Unknown client' }}</div>
        <div v-if="client" class="text-surface-500">{{ client.billingContact }} · {{ client.billingEmail }}</div>
      </div>
      <div>
        <div class="text-xs uppercase tracking-wide text-surface-400">Prepared by</div>
        <div class="mt-0.5 text-surface-800">{{ preparerName }}</div>
      </div>
      <div v-if="invoice.period">
        <div class="text-xs uppercase tracking-wide text-surface-400">Period</div>
        <div class="mt-0.5 text-surface-800">
          {{ invoice.period.startDate.slice(0, 10) }} – {{ invoice.period.endDate.slice(0, 10) }}
        </div>
      </div>
      <div v-if="invoice.dueDate">
        <div class="text-xs uppercase tracking-wide text-surface-400">Due date</div>
        <div class="mt-0.5 text-surface-800">{{ invoice.dueDate.slice(0, 10) }}</div>
      </div>
      <div v-if="invoice.paymentTerms">
        <div class="text-xs uppercase tracking-wide text-surface-400">Payment terms</div>
        <div class="mt-0.5 text-surface-800">{{ invoice.paymentTerms }}</div>
      </div>
    </div>

    <p v-if="invoice.taxNote" class="rounded-md border border-surface-200 bg-white px-3 py-2 text-sm text-surface-600">
      {{ invoice.taxNote }}
    </p>

    <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
      <table class="w-full text-sm">
        <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
          <tr v-if="invoice.type === 'collective'">
            <th class="px-4 py-2 font-medium">Description</th>
            <th class="px-4 py-2 text-right font-medium">Hours</th>
            <th class="px-4 py-2 text-right font-medium">VAT</th>
            <th class="px-4 py-2 text-right font-medium">Net</th>
            <th class="px-4 py-2 text-right font-medium">Gross</th>
            <th v-if="isManagedCollectiveDraft" class="px-4 py-2"></th>
          </tr>
          <tr v-else>
            <th class="px-4 py-2 font-medium">Description</th>
            <th class="px-4 py-2 text-right font-medium">Hours</th>
            <th class="px-4 py-2 text-right font-medium">Rate</th>
            <th class="px-4 py-2 text-right font-medium">Amount</th>
            <th v-if="isOwnPersonalDraft" class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-surface-100" v-if="invoice.type === 'collective'">
          <tr v-for="(item, i) in invoice.lineItems" :key="`li-${i}`">
            <td class="px-4 py-2">{{ item.description }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ item.hours.toFixed(2) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ item.taxRate ?? 0 }}%</td>
            <td class="px-4 py-2 text-right tabular-nums">
              <CurrencyDisplay :amount="item.netAmount ?? item.amount" :currency="invoice.currency" />
            </td>
            <td class="px-4 py-2 text-right tabular-nums">
              <CurrencyDisplay :amount="item.amount" :currency="invoice.currency" />
            </td>
            <td class="px-4 py-2 text-right">
              <button
                v-if="isManagedCollectiveDraft && item.personalInvoiceId"
                type="button"
                class="text-xs font-medium text-danger-600 hover:underline"
                :disabled="unpoolingInvoice"
                @click="handleRemoveFromPool(item.personalInvoiceId)"
              >
                Remove from pool
              </button>
            </td>
          </tr>
          <tr v-for="(item, i) in invoice.manualItems" :key="`mi-${i}`">
            <td class="px-4 py-2">{{ item.description }}</td>
            <td class="px-4 py-2 text-right text-surface-300">—</td>
            <td class="px-4 py-2 text-right text-surface-300">—</td>
            <td class="px-4 py-2 text-right text-surface-300">—</td>
            <td class="px-4 py-2 text-right tabular-nums">
              <CurrencyDisplay :amount="item.amount" :currency="invoice.currency" />
            </td>
            <td v-if="isManagedCollectiveDraft" class="px-4 py-2"></td>
          </tr>
        </tbody>
        <tbody class="divide-y divide-surface-100" v-else>
          <tr v-for="(item, i) in invoice.lineItems" :key="`li-${i}`">
            <td class="px-4 py-2">{{ item.description }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ item.hours.toFixed(2) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ item.rate.toFixed(2) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">
              <CurrencyDisplay :amount="item.amount" :currency="invoice.currency" />
            </td>
            <td class="px-4 py-2 text-right">
              <button
                v-if="isOwnPersonalDraft && item.timeRecordId"
                type="button"
                class="text-xs font-medium text-danger-600 hover:underline"
                :disabled="removingRecord"
                @click="handleRemoveTimeRecord(item.timeRecordId)"
              >
                Remove
              </button>
            </td>
          </tr>
          <tr v-for="(item, i) in invoice.manualItems" :key="`mi-${i}`">
            <td class="px-4 py-2">{{ item.description }}</td>
            <td class="px-4 py-2 text-right text-surface-300">—</td>
            <td class="px-4 py-2 text-right text-surface-300">—</td>
            <td class="px-4 py-2 text-right tabular-nums">
              <CurrencyDisplay :amount="item.amount" :currency="invoice.currency" />
            </td>
            <td v-if="isOwnPersonalDraft" class="px-4 py-2"></td>
          </tr>
        </tbody>
        <tfoot class="border-t border-surface-200 text-sm">
          <tr>
            <td :colspan="invoice.type === 'collective' ? 4 : 3" class="px-4 py-1.5 text-right text-surface-500">Subtotal</td>
            <td class="px-4 py-1.5 text-right tabular-nums"><CurrencyDisplay :amount="invoice.subtotal" :currency="invoice.currency" /></td>
            <td v-if="isOwnPersonalDraft || isManagedCollectiveDraft"></td>
          </tr>
          <tr v-for="tax in invoice.taxes" :key="tax.name">
            <td :colspan="invoice.type === 'collective' ? 4 : 3" class="px-4 py-1.5 text-right text-surface-500">{{ tax.name }} ({{ tax.rate }}%)</td>
            <td class="px-4 py-1.5 text-right tabular-nums"><CurrencyDisplay :amount="tax.amount" :currency="invoice.currency" /></td>
            <td v-if="isOwnPersonalDraft || isManagedCollectiveDraft"></td>
          </tr>
          <tr class="font-semibold text-surface-900">
            <td :colspan="invoice.type === 'collective' ? 4 : 3" class="px-4 py-2 text-right">Total</td>
            <td class="px-4 py-2 text-right tabular-nums"><CurrencyDisplay :amount="invoice.total" :currency="invoice.currency" /></td>
            <td v-if="isOwnPersonalDraft || isManagedCollectiveDraft"></td>
          </tr>
          <tr v-if="invoice.partialPaymentAmount !== null" class="text-success-600">
            <td :colspan="invoice.type === 'collective' ? 4 : 3" class="px-4 py-1.5 text-right">Paid</td>
            <td class="px-4 py-1.5 text-right tabular-nums">
              <CurrencyDisplay :amount="invoice.partialPaymentAmount" :currency="invoice.currency" />
            </td>
            <td v-if="isOwnPersonalDraft || isManagedCollectiveDraft"></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p v-if="invoice.notes" class="rounded-md bg-surface-100 px-3 py-2 text-sm text-surface-600">{{ invoice.notes }}</p>

    <!-- Add more time to a draft personal invoice -->
    <div v-if="isOwnPersonalDraft" class="rounded-lg border border-surface-200 bg-white p-4">
      <h2 class="mb-2 text-sm font-semibold text-surface-800">Add more time</h2>
      <EmptyState
        v-if="eligibleTimeRecords.length === 0"
        title="Nothing else eligible"
        message="Every approved, billable, un-invoiced entry on this project is already on this draft."
      />
      <ul v-else class="space-y-1 rounded-md border border-surface-200 p-2">
        <li v-for="r in eligibleTimeRecords" :key="r._id" class="flex items-center justify-between text-sm">
          <span class="text-surface-700">{{ r.date.slice(0, 10) }} · {{ (r.durationMinutes / 60).toFixed(2) }}h</span>
          <AppButton variant="ghost" :loading="addingRecord" @click="handleAddTimeRecord(r._id)">Add</AppButton>
        </li>
      </ul>
    </div>

    <!-- Add more sent personal invoices to a draft collective invoice's pool -->
    <div v-if="isManagedCollectiveDraft" class="rounded-lg border border-surface-200 bg-white p-4">
      <h2 class="mb-2 text-sm font-semibold text-surface-800">Add more to the pool</h2>
      <EmptyState
        v-if="eligiblePersonalInvoices.length === 0"
        title="Nothing else eligible"
        message="Every sent, unpooled personal invoice for this client is already in this pool."
      />
      <ul v-else class="space-y-1 rounded-md border border-surface-200 p-2">
        <li v-for="pi in eligiblePersonalInvoices" :key="pi._id" class="flex items-center justify-between text-sm">
          <span class="text-surface-700">
            {{ pi.invoiceNumber }} · VAT {{ pi.taxes[0]?.rate ?? 0 }}% ·
            <CurrencyDisplay :amount="pi.total" :currency="pi.currency" />
          </span>
          <AppButton variant="ghost" :loading="poolingInvoice" @click="handleAddToPool(pi._id)">Add to pool</AppButton>
        </li>
      </ul>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <AppButton variant="secondary" :loading="exportingPdf" @click="exportPdf">Export PDF</AppButton>
      <AppButton variant="secondary" :loading="exportingCsv" @click="exportCsv">Export CSV</AppButton>
      <template v-if="isDraft">
        <AppButton variant="secondary" @click="openEdit">Edit draft</AppButton>
        <AppButton variant="danger" @click="showDeleteConfirm = true">Delete draft</AppButton>
        <AppButton :loading="sending" @click="send">Send</AppButton>
      </template>
      <AppButton
        v-if="team.isManager && invoice.status !== 'draft' && invoice.status !== 'paid'"
        variant="secondary"
        @click="showPayment = true"
      >
        Record payment
      </AppButton>
      <AppButton v-if="canRevertToDraft" variant="secondary" @click="showRevertConfirm = true">
        Revert to draft
      </AppButton>
    </div>

    <Modal v-if="showEdit" title="Edit draft" @close="showEdit = false">
      <form id="edit-invoice-form" class="space-y-4" @submit.prevent="saveEdit">
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Due date">
            <input v-model="editDueDate" type="date" class="field-control" />
          </FormField>
          <FormField label="Payment terms" hint="e.g. Net 30">
            <input v-model="editPaymentTerms" class="field-control" placeholder="Optional" />
          </FormField>
        </div>
        <FormField label="Tax note" hint="e.g. reverse charge or exemption reference for EU intra-community transactions.">
          <textarea v-model="editTaxNote" rows="2" class="field-control" placeholder="Optional" />
        </FormField>
        <FormField label="Notes">
          <textarea v-model="editNotes" rows="2" class="field-control" />
        </FormField>
        <fieldset class="rounded-md border border-surface-200 p-3">
          <legend class="px-1 text-xs font-medium text-surface-500">Manual items</legend>
          <div class="space-y-2">
            <div v-for="(item, i) in editManualItems" :key="i" class="flex items-center gap-2">
              <input v-model="item.description" placeholder="Description" class="field-control" />
              <input v-model.number="item.amount" type="number" step="0.01" class="field-control w-28" />
              <AppButton variant="ghost" @click="removeManualItem(i)">Remove</AppButton>
            </div>
            <AppButton variant="secondary" @click="addManualItem">Add item</AppButton>
          </div>
        </fieldset>
        <fieldset v-if="invoice.type === 'personal'" class="rounded-md border border-surface-200 p-3">
          <legend class="px-1 text-xs font-medium text-surface-500">Tax</legend>
          <div class="flex items-center gap-2">
            <input v-model="editTaxName" placeholder="Tax name (e.g. VAT)" class="field-control" />
            <input
              v-model.number="editTaxRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="Rate %"
              class="field-control w-28"
            />
          </div>
        </fieldset>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showEdit = false">Cancel</AppButton>
        <AppButton form="edit-invoice-form" type="submit" :loading="saving">Save</AppButton>
      </template>
    </Modal>

    <Modal v-if="showPayment" title="Record payment" @close="showPayment = false">
      <form id="payment-form" class="space-y-4" @submit.prevent="recordPayment">
        <FormField label="Amount">
          <input v-model="paymentAmount" type="number" step="0.01" min="0.01" required class="field-control" />
        </FormField>
        <FormField label="Date">
          <input v-model="paymentDate" type="date" required class="field-control" />
        </FormField>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showPayment = false">Cancel</AppButton>
        <AppButton form="payment-form" type="submit" :loading="recordingPayment">Record</AppButton>
      </template>
    </Modal>

    <ConfirmDialog
      v-if="showDeleteConfirm"
      title="Delete draft invoice"
      message="This un-marks its time records as invoiced (and releases any pooled personal invoices) so they become available again. Continue?"
      confirm-label="Delete"
      danger
      :loading="deleting"
      @confirm="deleteDraft"
      @cancel="showDeleteConfirm = false"
    />

    <ConfirmDialog
      v-if="showRevertConfirm"
      title="Revert to draft"
      message="This moves the invoice back to draft so it can be edited again. Its time records stay attached. Continue?"
      confirm-label="Revert to draft"
      :loading="reverting"
      @confirm="revertToDraft"
      @cancel="showRevertConfirm = false"
    />
  </div>
</template>
