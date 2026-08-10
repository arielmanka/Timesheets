<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useClientsStore } from '../../stores/clients'
import { useTeamStore } from '../../stores/team'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { Client, ClientInput } from '../../types/client'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'
import Modal from '../../components/ui/Modal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const route = useRoute()
const teamId = route.params.teamId as string
const clients = useClientsStore()
const team = useTeamStore()
const ui = useUiStore()

const { loading, run: load } = useAsyncAction(() => clients.fetchAll(teamId))
onMounted(load)

function emptyForm(): ClientInput {
  return {
    name: '',
    billingContact: '',
    billingEmail: '',
    billingAddress: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
    taxId: '',
  }
}

const editingId = ref<string | null>(null)
const showForm = ref(false)
const form = reactive<ClientInput>(emptyForm())

function openCreate(): void {
  editingId.value = null
  Object.assign(form, emptyForm())
  showForm.value = true
}

function openEdit(client: Client): void {
  editingId.value = client._id
  Object.assign(form, {
    name: client.name,
    billingContact: client.billingContact,
    billingEmail: client.billingEmail,
    billingAddress: { ...client.billingAddress },
    taxId: client.taxId ?? '',
  })
  showForm.value = true
}

const { loading: saving, run: save } = useAsyncAction(async () => {
  const input: ClientInput = { ...form, taxId: form.taxId || null }
  if (editingId.value) {
    await clients.update(teamId, editingId.value, input)
    ui.success('Client updated.')
  } else {
    await clients.create(teamId, input)
    ui.success('Client created.')
  }
  showForm.value = false
})
</script>

<template>
  <div>
    <div class="mb-5 flex items-center justify-between">
      <h1 class="text-lg font-semibold text-surface-900">Clients</h1>
      <AppButton v-if="team.isManager" @click="openCreate">New client</AppButton>
    </div>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>
    <EmptyState v-else-if="clients.items.length === 0" title="No clients yet" message="Managers can add a client to start billing projects to them." />

    <ul v-else class="space-y-2">
      <li
        v-for="client in clients.items"
        :key="client._id"
        class="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-4 py-3"
      >
        <div>
          <div class="font-medium text-surface-900">{{ client.name }}</div>
          <div class="text-xs text-surface-500">{{ client.billingContact }} · {{ client.billingEmail }}</div>
        </div>
        <AppButton v-if="team.isManager" variant="ghost" @click="openEdit(client)">Edit</AppButton>
      </li>
    </ul>

    <Modal v-if="showForm" :title="editingId ? 'Edit client' : 'New client'" wide @close="showForm = false">
      <form id="client-form" class="space-y-4" @submit.prevent="save">
        <FormField label="Client name">
          <input v-model="form.name" required class="field-control" />
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Billing contact">
            <input v-model="form.billingContact" required class="field-control" />
          </FormField>
          <FormField label="Billing email">
            <input v-model="form.billingEmail" type="email" required class="field-control" />
          </FormField>
        </div>
        <FormField label="Tax ID" hint="Optional.">
          <input v-model="form.taxId" class="field-control" />
        </FormField>
        <fieldset class="rounded-md border border-surface-200 p-3">
          <legend class="px-1 text-xs font-medium text-surface-500">Billing address</legend>
          <div class="space-y-3">
            <FormField label="Address line 1">
              <input v-model="form.billingAddress.line1" required class="field-control" />
            </FormField>
            <FormField label="Address line 2">
              <input v-model="form.billingAddress.line2" class="field-control" />
            </FormField>
            <div class="grid grid-cols-2 gap-3">
              <FormField label="City">
                <input v-model="form.billingAddress.city" required class="field-control" />
              </FormField>
              <FormField label="State / region">
                <input v-model="form.billingAddress.state" required class="field-control" />
              </FormField>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <FormField label="Postal code">
                <input v-model="form.billingAddress.postalCode" required class="field-control" />
              </FormField>
              <FormField label="Country">
                <input v-model="form.billingAddress.country" required class="field-control" />
              </FormField>
            </div>
          </div>
        </fieldset>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showForm = false">Cancel</AppButton>
        <AppButton form="client-form" type="submit" :loading="saving">{{ editingId ? 'Save' : 'Create' }}</AppButton>
      </template>
    </Modal>
  </div>
</template>
