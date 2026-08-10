<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectsStore } from '../../stores/projects'
import { useClientsStore } from '../../stores/clients'
import { useInvoicesStore } from '../../stores/invoices'
import { useTeamStore } from '../../stores/team'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import * as invoicesService from '../../services/invoices.service'
import type { Invoice, ManualItemInput } from '../../types/invoice'
import StatusPill from '../../components/ui/StatusPill.vue'
import CurrencyDisplay from '../../components/ui/CurrencyDisplay.vue'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'
import Modal from '../../components/ui/Modal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const teamId = route.params.teamId as string
const projects = useProjectsStore()
const clients = useClientsStore()
const invoices = useInvoicesStore()
const team = useTeamStore()
const ui = useUiStore()

const { loading, run: load } = useAsyncAction(async () => {
  await Promise.all([
    invoices.fetchAll(teamId),
    clients.loaded ? Promise.resolve() : clients.fetchAll(teamId),
    projects.loaded ? Promise.resolve() : projects.fetchAll(teamId),
  ])
})
onMounted(load)

const collectiveInvoices = computed(() => invoices.items.filter((i) => i.type === 'collective'))

function memberName(userId: string): string {
  const m = team.current?.members.find((mm) => mm.userId === userId)
  return m ? `${m.firstName} ${m.lastName}` : 'Unknown'
}

function clientName(clientId: string): string {
  return clients.items.find((c) => c._id === clientId)?.name ?? 'Unknown client'
}

function projectName(projectId: string): string {
  return projects.items.find((p) => p._id === projectId)?.name ?? 'Unknown project'
}

// --- New collective invoice ------------------------------------------------
const showCreate = ref(false)
const clientId = ref('')
const periodStart = ref('')
const periodEnd = ref('')
const pool = ref<Invoice[]>([])
const selectedPoolIds = ref<Set<string>>(new Set())
const notes = ref('')
const manualItems = ref<ManualItemInput[]>([])

function openCreate(): void {
  clientId.value = ''
  periodStart.value = ''
  periodEnd.value = ''
  pool.value = []
  selectedPoolIds.value = new Set()
  notes.value = ''
  manualItems.value = []
  showCreate.value = true
}

// A collective invoice is built exclusively from sent personal invoices —
// never directly from time records. Every team member is expected to create
// and send their own personal invoice; that's the only way their time
// enters a pool. A personal invoice must be Sent — not Draft — before it's
// eligible: a draft is still editable by its owner, so pooling it would let
// the collective invoice go stale the moment they changed it. `unpooled`
// also excludes anything already rolled into another collective invoice.
const { loading: loadingPool, run: loadPool } = useAsyncAction(async () => {
  if (!clientId.value) return
  pool.value = await invoicesService.listInvoices(teamId, {
    clientId: clientId.value,
    type: 'personal',
    status: 'sent',
    unpooled: true,
  })
  selectedPoolIds.value = new Set(pool.value.map((i) => i._id))
})

watch(clientId, loadPool)

function togglePool(id: string): void {
  if (selectedPoolIds.value.has(id)) selectedPoolIds.value.delete(id)
  else selectedPoolIds.value.add(id)
}

function addManualItem(): void {
  manualItems.value.push({ description: '', amount: 0 })
}
function removeManualItem(i: number): void {
  manualItems.value.splice(i, 1)
}

const { loading: creating, run: createCollective } = useAsyncAction(async () => {
  const invoice = await invoices.createCollective(teamId, {
    clientId: clientId.value,
    period: { startDate: periodStart.value, endDate: periodEnd.value },
    personalInvoiceIds: Array.from(selectedPoolIds.value),
    notes: notes.value || null,
    manualItems: manualItems.value.filter((m) => m.description.trim() !== ''),
  })
  ui.success(`Collective invoice #${invoice.invoiceNumber} created.`)
  showCreate.value = false
  router.push({ name: 'invoice-detail', params: { teamId, invoiceId: invoice._id } })
})
</script>

<template>
  <div class="max-w-2xl">
    <div class="mb-1 flex items-center justify-between">
      <h1 class="text-lg font-semibold text-surface-900">Invoicing pool</h1>
      <AppButton @click="openCreate">New collective invoice</AppButton>
    </div>
    <p class="mb-5 text-sm text-surface-500">
      Roll up sent personal invoices from the team into one collective invoice for a client — spanning every
      project that client has. Time only enters a pool once its owner has sent their own personal invoice for it.
    </p>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>
    <EmptyState
      v-else-if="collectiveInvoices.length === 0"
      title="No collective invoices yet"
      message="Create one to bill a client for its team's pooled, sent personal invoices."
    />
    <ul v-else class="space-y-2">
      <li v-for="inv in collectiveInvoices" :key="inv._id">
        <router-link
          :to="{ name: 'invoice-detail', params: { teamId, invoiceId: inv._id } }"
          class="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-4 py-3 hover:border-primary-300"
        >
          <div>
            <div class="font-medium text-surface-900">#{{ inv.invoiceNumber }} · {{ clientName(inv.clientId) }}</div>
            <div class="text-xs text-surface-500">
              <span v-if="inv.period">{{ inv.period.startDate.slice(0, 10) }} – {{ inv.period.endDate.slice(0, 10) }} · </span>
              <CurrencyDisplay :amount="inv.total" :currency="inv.currency" />
            </div>
          </div>
          <StatusPill :status="inv.status" />
        </router-link>
      </li>
    </ul>

    <Modal v-if="showCreate" title="New collective invoice" wide @close="showCreate = false">
      <div class="space-y-4">
        <FormField label="Client">
          <select v-model="clientId" required class="field-control">
            <option value="" disabled>Select a client</option>
            <option v-for="c in clients.items" :key="c._id" :value="c._id">{{ c.name }}</option>
          </select>
        </FormField>

        <div class="grid grid-cols-2 gap-3">
          <FormField label="Period start" hint="Descriptive only — doesn't filter what's eligible.">
            <input v-model="periodStart" type="date" required class="field-control" />
          </FormField>
          <FormField label="Period end">
            <input v-model="periodEnd" type="date" required class="field-control" />
          </FormField>
        </div>

        <div v-if="clientId">
          <h2 class="mb-2 text-sm font-medium text-surface-800">Sent personal invoices, not yet pooled</h2>
          <p v-if="loadingPool" class="text-sm text-surface-500">Loading…</p>
          <EmptyState
            v-else-if="pool.length === 0"
            title="No sent personal invoices for this client"
            message="A personal invoice only shows up here once its owner has sent it — a draft they're still editing isn't pool-eligible yet."
          />
          <ul v-else class="space-y-1 rounded-md border border-surface-200 p-2">
            <li v-for="inv in pool" :key="inv._id" class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                :checked="selectedPoolIds.has(inv._id)"
                class="h-4 w-4 rounded border-surface-300"
                @change="togglePool(inv._id)"
              />
              <span class="text-surface-700">
                #{{ inv.invoiceNumber }} · {{ memberName(inv.createdBy) }} ·
                {{ inv.projectId ? projectName(inv.projectId) : '' }} ·
                <CurrencyDisplay :amount="inv.total" :currency="inv.currency" />
              </span>
            </li>
          </ul>
        </div>

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
        <AppButton variant="secondary" @click="showCreate = false">Cancel</AppButton>
        <AppButton
          :disabled="!clientId || !periodStart || !periodEnd || selectedPoolIds.size === 0"
          :loading="creating"
          @click="createCollective"
        >
          Create collective invoice
        </AppButton>
      </template>
    </Modal>
  </div>
</template>
