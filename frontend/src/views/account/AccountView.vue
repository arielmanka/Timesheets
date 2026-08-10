<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useAuthStore } from '../../stores/auth'
import * as usersService from '../../services/users.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
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
