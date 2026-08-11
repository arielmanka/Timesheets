<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useAuthStore } from '../../stores/auth'
import * as usersService from '../../services/users.service'
import * as notificationsService from '../../services/notifications.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { BankAccountDetails, EmploymentType } from '../../types/user'
import type { NotificationPreferenceEntry } from '../../types/notification'
import FormField from '../../components/ui/FormField.vue'
import AppButton from '../../components/ui/AppButton.vue'
import ConfirmDialog from '../../components/ui/ConfirmDialog.vue'
import BankAccountFields from '../../components/account/BankAccountFields.vue'

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
const phone = ref('')
const address = ref({ line1: '', line2: '', city: '', state: '', postalCode: '', country: '' })

watchEffect(() => {
  if (!auth.user) return
  employmentType.value = auth.user.employmentType
  if (auth.user.incorporation) {
    companyName.value = auth.user.incorporation.companyName
    taxId.value = auth.user.incorporation.taxId
    phone.value = auth.user.incorporation.phone ?? ''
    address.value = { ...auth.user.incorporation.address, line2: auth.user.incorporation.address.line2 ?? '' }
  }
})

const { loading: savingEmployment, run: saveEmployment } = useAsyncAction(async () => {
  const updated = await usersService.updateMyProfile({
    employmentType: employmentType.value,
    incorporation:
      employmentType.value === 'contractor'
        ? {
            companyName: companyName.value,
            taxId: taxId.value,
            phone: phone.value || null,
            address: { ...address.value, line2: address.value.line2 || null },
          }
        : null,
  })
  auth.setUser(updated)
  ui.success('Employment & billing details updated.')
})

// --- Bank accounts — personal (paid as an individual contributor) and
// collective (paid on the team's behalf when issuing a collective invoice as
// a manager) are kept separate since a manager may need both. -------------
const personalBankAccount = ref<BankAccountDetails | null>(null)
const collectiveBankAccount = ref<BankAccountDetails | null>(null)

watchEffect(() => {
  if (!auth.user) return
  personalBankAccount.value = auth.user.personalBankAccount
  collectiveBankAccount.value = auth.user.collectiveBankAccount
})

const { loading: savingBankAccounts, run: saveBankAccounts } = useAsyncAction(async () => {
  const updated = await usersService.updateMyProfile({
    personalBankAccount: personalBankAccount.value,
    collectiveBankAccount: collectiveBankAccount.value,
  })
  auth.setUser(updated)
  ui.success('Bank accounts updated.')
})

// --- Notification preferences (automation backbone) -----------------------
const preferences = ref<NotificationPreferenceEntry[]>([])
const emailAvailable = ref(false)
const savingPreference = ref<string | null>(null)
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const { loading: loadingPreferences, run: loadPreferences } = useAsyncAction(async () => {
  const result = await notificationsService.getNotificationPreferences()
  preferences.value = result.preferences
  emailAvailable.value = result.emailAvailable
})
loadPreferences()

async function togglePreference(pref: NotificationPreferenceEntry, field: 'enabled' | 'emailEnabled'): Promise<void> {
  const next = !pref[field]
  pref[field] = next
  savingPreference.value = pref.ruleType
  try {
    await notificationsService.updateNotificationPreference(pref.ruleType, { [field]: next })
  } finally {
    savingPreference.value = null
  }
}

async function updatePreferenceParam(pref: NotificationPreferenceEntry, key: string, value: number): Promise<void> {
  pref.params = { ...pref.params, [key]: value }
  savingPreference.value = pref.ruleType
  try {
    await notificationsService.updateNotificationPreference(pref.ruleType, { params: { [key]: value } })
  } finally {
    savingPreference.value = null
  }
}

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
        <FormField label="Phone">
          <input v-model="phone" type="tel" class="field-control" />
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

    <form class="space-y-6 rounded-lg border border-surface-200 bg-white p-5" @submit.prevent="saveBankAccounts">
      <div>
        <h2 class="text-sm font-semibold text-surface-800">Bank accounts</h2>
        <p class="mt-1 text-xs text-surface-500">
          Your personal account is used on invoices you create for your own time. If you're a manager, your
          collective account is used on collective invoices you issue on the team's behalf — a separate account
          since the two may not be the same.
        </p>
      </div>

      <fieldset class="rounded-md border border-surface-200 p-3">
        <legend class="px-1 text-xs font-medium text-surface-500">Personal account</legend>
        <BankAccountFields v-model="personalBankAccount" />
      </fieldset>

      <fieldset class="rounded-md border border-surface-200 p-3">
        <legend class="px-1 text-xs font-medium text-surface-500">Collective account</legend>
        <BankAccountFields v-model="collectiveBankAccount" />
      </fieldset>

      <AppButton type="submit" :loading="savingBankAccounts">Save changes</AppButton>
    </form>

    <div class="space-y-4 rounded-lg border border-surface-200 bg-white p-5">
      <div>
        <h2 class="text-sm font-semibold text-surface-800">Notification preferences</h2>
        <p class="mt-1 text-xs text-surface-500">
          Rules this app watches on your behalf — overdue invoices, missed weekly time entries, projects ending
          soon, and approval backlogs. Manager-scoped rules only appear here if you manage at least one team.
          Changes save automatically.
        </p>
        <p v-if="!emailAvailable" class="mt-2 rounded-md bg-surface-100 px-2.5 py-1.5 text-xs text-surface-500">
          Email delivery isn't configured on this server (EMAIL_PROVIDER=console) — "also email me" will still be
          logged server-side but won't send a real email until SMTP is set up.
        </p>
      </div>

      <p v-if="loadingPreferences" class="text-sm text-surface-500">Loading…</p>
      <ul v-else class="space-y-3">
        <li v-for="pref in preferences" :key="pref.ruleType" class="rounded-md border border-surface-200 p-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-medium text-surface-800">{{ pref.label }}</div>
              <p class="mt-0.5 text-xs text-surface-500">{{ pref.description }}</p>
            </div>
            <label class="flex shrink-0 items-center gap-1.5 text-xs text-surface-600">
              <input
                type="checkbox"
                :checked="pref.enabled"
                class="h-4 w-4 rounded border-surface-300"
                @change="togglePreference(pref, 'enabled')"
              />
              Enabled
            </label>
          </div>

          <template v-if="pref.enabled">
            <label class="mt-2 flex items-center gap-1.5 text-xs text-surface-600">
              <input
                type="checkbox"
                :checked="pref.emailEnabled"
                class="h-4 w-4 rounded border-surface-300"
                @change="togglePreference(pref, 'emailEnabled')"
              />
              Also email me
            </label>

            <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-surface-600">
              <template v-if="pref.ruleType === 'invoice_overdue'">
                <label class="flex items-center gap-1.5">
                  Grace period
                  <input
                    type="number"
                    min="0"
                    class="field-control w-16 py-1"
                    :value="pref.params.graceDays"
                    @change="updatePreferenceParam(pref, 'graceDays', Number(($event.target as HTMLInputElement).value))"
                  />
                  days
                </label>
              </template>
              <template v-else-if="pref.ruleType === 'missed_weekly_time_entry'">
                <label class="flex items-center gap-1.5">
                  Remind me from
                  <select
                    class="field-control w-32 py-1"
                    :value="pref.params.weekday"
                    @change="updatePreferenceParam(pref, 'weekday', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="(day, i) in WEEKDAY_LABELS" :key="day" :value="i + 1">{{ day }}</option>
                  </select>
                </label>
                <label class="flex items-center gap-1.5">
                  if under
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    class="field-control w-16 py-1"
                    :value="pref.params.minHours"
                    @change="updatePreferenceParam(pref, 'minHours', Number(($event.target as HTMLInputElement).value))"
                  />
                  hours logged that week
                </label>
              </template>
              <template v-else-if="pref.ruleType === 'project_ending_soon'">
                <label class="flex items-center gap-1.5">
                  Notify
                  <input
                    type="number"
                    min="1"
                    class="field-control w-16 py-1"
                    :value="pref.params.daysAhead"
                    @change="updatePreferenceParam(pref, 'daysAhead', Number(($event.target as HTMLInputElement).value))"
                  />
                  days before the end date
                </label>
              </template>
              <template v-else-if="pref.ruleType === 'pending_approval_backlog'">
                <label class="flex items-center gap-1.5">
                  Notify once pending
                  <input
                    type="number"
                    min="1"
                    class="field-control w-16 py-1"
                    :value="pref.params.thresholdDays"
                    @change="updatePreferenceParam(pref, 'thresholdDays', Number(($event.target as HTMLInputElement).value))"
                  />
                  days or more
                </label>
              </template>
            </div>
          </template>
        </li>
      </ul>
    </div>

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
