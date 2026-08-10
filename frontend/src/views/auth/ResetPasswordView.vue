<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as authService from '../../services/auth.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import FormField from '../../components/ui/FormField.vue'
import AppButton from '../../components/ui/AppButton.vue'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

const token = ref((route.params.token as string) || '')
const password = ref('')

const { loading, run } = useAsyncAction(async () => {
  await authService.resetPassword(token.value, password.value)
  ui.success('Password reset. You can log in with your new password.')
  router.push({ name: 'login' })
})
</script>

<template>
  <h1 class="mb-5 text-lg font-semibold text-surface-900">Set a new password</h1>
  <form class="space-y-4" @submit.prevent="run">
    <FormField v-if="!route.params.token" label="Reset token" hint="From the link in your email.">
      <input v-model="token" required class="field-control" />
    </FormField>
    <FormField label="New password" hint="At least 8 characters.">
      <input v-model="password" type="password" required minlength="8" autocomplete="new-password" class="field-control" />
    </FormField>
    <AppButton type="submit" class="w-full" :loading="loading">Reset password</AppButton>
  </form>
</template>
