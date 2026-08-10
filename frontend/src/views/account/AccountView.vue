<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useAuthStore } from '../../stores/auth'
import * as usersService from '../../services/users.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { EmploymentType } from '../../types/user'
import FormField from '../../components/ui/FormField.vue'
import AppButton from '../../components/ui/AppButton.vue'
import ConfirmDialog from '../../components/ui/ConfirmDialog.vue'

const auth = useAuthStore()
const ui = useUiStore()

const firstName = ref('')
const lastName = ref('')
const locale = ref('')

watchEffect(() => {
  if (auth.user) {
    firstName.value = auth.user.firstName
    lastName.value = auth.user.lastName
    locale.value = auth.user.locale
  }
})

const { loading: savingProfile, run: saveProfile } = useAsyncAction(async () => {
  const updated = await usersService.updateMyProfile({
    firstName: firstName.value,
    lastName: lastName.value,
    locale: locale.value,
  })
  auth.setUser(updated)
  ui.success('Profile updated.')
})

// --- Employment type & incorporation (contractor billing profile) --------
const employmentType = ref<EmploymentType>('employee')
const companyName = ref('')
const taxId = ref('')
const address = ref({ line1: '', line2: '', city: '', state: '', postalCode: '', country: '' })

watchEffect(() => {
  if (!auth.user) return
  employmentType.value = auth.user.employmentType
  if (auth.user.incorporation) {
    companyName.value = auth.user.incorporation.companyName
    taxId.value = auth.user.incorporation.taxId
    address.value = { ...auth.user.incorporation.address, line2: auth.user.incorporation.address.line2 ?? '' }
  }
})

const { loading: savingEmployment, run: saveEmployment } = useAsyncAction(async () => {
  const updated = await usersService.updateMyProfile({
    employmentType: employmentType.value,
    incorporation:
      employmentType.value === 'contractor'
        ? { companyName: companyName.value, taxId: taxId.value, address: { ...address.value, line2: address.value.line2 || null } }
        : null,
  })
  auth.setUser(updated)
  ui.success('Employment & billing details updated.')
})

const showDeleteConfirm = ref(false)
const deletionRequestedAt = ref<string | null>(null)
const { loading: deleting, run: requestDeletion } = useAsyncAction(async () => {
  const result = await usersService.requestAccountDeletion()
  deletionRequestedAt.value = result.requestedAt
  showDeleteConfirm.value = false
  ui.success('Deletion request filed.')
})
</script>

<template>
  <div class="max-w-lg space-y-8">
    <div>
      <h1 class="text-lg font-semibold text-surface-900">Account</h1>
      <p class="mt-1 text-sm text-surface-500">
        Your user ID:
        <code class="rounded bg-surface-100 px-1.5 py-0.5 text-xs">{{ auth.user?.uid }}</code>
        — share this with a manager so they can add you to a team.
      </p>
    </div>

    <form class="space-y-4 rounded-lg border border-surface-200 bg-white p-5" @submit.prevent="saveProfile">
      <h2 class="text-sm font-semibold text-surface-800">Profile</h2>
      <FormField label="Email">
        <input :value="auth.user?.email" disabled class="field-control" />
      </FormField>
      <div class="grid grid-cols-2 gap-3">
        <FormField label="First name">
          <input v-model="firstName" required class="field-control" />
        </FormField>
        <FormField label="Last name">
          <input v-model="lastName" required class="field-control" />
        </FormField>
      </div>
      <FormField label="Locale" hint="Used to format dates, e.g. en-US, fr-FR, de-DE.">
        <input v-model="locale" required class="field-control" />
      </FormField>
      <AppButton type="submit" :loading="savingProfile">Save changes</AppButton>
    </form>

    <form class="space-y-4 rounded-lg border border-surface-200 bg-white p-5" @submit.prevent="saveEmployment">
      <div>
        <h2 class="text-sm font-semibold text-surface-800">Employment & billing</h2>
        <p class="mt-1 text-xs text-surface-500">
          Contractors bill on a B2B basis and can issue tax invoices (VAT/GST/HST) using their own incorporated
          business details.
        </p>
      </div>

      <FormField label="Working as">
        <select v-model="employmentType" class="field-control">
          <option value="employee">Employee</option>
          <option value="contractor">Contractor (B2B)</option>
        </select>
      </FormField>

      <template v-if="employmentType === 'contractor'">
        <FormField label="Company name">
          <input v-model="companyName" required class="field-control" />
        </FormField>
        <FormField label="Tax ID" hint="VAT / Business Number / GST / HST registration number.">
          <input v-model="taxId" required class="field-control" />
        </FormField>
        <fieldset class="rounded-md border border-surface-200 p-3">
          <legend class="px-1 text-xs font-medium text-surface-500">Company address</legend>
          <div class="space-y-3">
            <FormField label="Address line 1">
              <input v-model="address.line1" required class="field-control" />
            </FormField>
            <FormField label="Address line 2">
              <input v-model="address.line2" class="field-control" />
            </FormField>
            <div class="grid grid-cols-2 gap-3">
              <FormField label="City">
                <input v-model="address.city" required class="field-control" />
              </FormField>
              <FormField label="State / Province">
                <input v-model="address.state" required class="field-control" />
              </FormField>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <FormField label="Postal code">
                <input v-model="address.postalCode" required class="field-control" />
              </FormField>
              <FormField label="Country">
                <input v-model="address.country" required class="field-control" />
              </FormField>
            </div>
          </div>
        </fieldset>
      </template>

      <AppButton type="submit" :loading="savingEmployment">Save changes</AppButton>
    </form>

    <div class="rounded-lg border border-danger-600/20 bg-white p-5">
      <h2 class="text-sm font-semibold text-surface-800">Delete account</h2>
      <p class="mt-1 text-sm text-surface-500">
        Filing a request marks your account for review — it does not immediately erase your data. Financial records
        may be retained as required by law; invoiced time may be kept in anonymized form.
      </p>
      <p v-if="auth.user?.deletionRequestedAt || deletionRequestedAt" class="mt-2 text-sm text-warning-600">
        Deletion already requested.
      </p>
      <AppButton v-else variant="danger" class="mt-3" @click="showDeleteConfirm = true">Request deletion</AppButton>
    </div>

    <ConfirmDialog
      v-if="showDeleteConfirm"
      title="Request account deletion"
      message="This files a deletion request for review — your account stays active until it's processed. Continue?"
      confirm-label="Request deletion"
      danger
      :loading="deleting"
      @confirm="requestDeletion"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>
