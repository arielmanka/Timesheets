<script setup lang="ts">
import { ref } from 'vue'
import * as authService from '../../services/auth.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import FormField from '../../components/ui/FormField.vue'
import AppButton from '../../components/ui/AppButton.vue'

const email = ref('')
const sent = ref(false)

const { loading, run } = useAsyncAction(async () => {
  await authService.requestPasswordReset(email.value)
  sent.value = true
})
</script>

<template>
  <div v-if="sent" class="text-center">
    <h1 class="mb-2 text-lg font-semibold text-surface-900">Check your inbox</h1>
    <p class="text-sm text-surface-600">If an account exists for {{ email }}, a reset link is on its way.</p>
    <router-link to="/login" class="mt-4 inline-block text-sm text-primary-600 hover:underline">
      Back to log in
    </router-link>
  </div>

  <template v-else>
    <h1 class="mb-2 text-lg font-semibold text-surface-900">Reset your password</h1>
    <p class="mb-5 text-sm text-surface-500">We'll email you a link to set a new password.</p>
    <form class="space-y-4" @submit.prevent="run">
      <FormField label="Email">
        <input v-model="email" type="email" required autocomplete="email" class="field-control" />
      </FormField>
      <AppButton type="submit" class="w-full" :loading="loading">Send reset link</AppButton>
    </form>
    <p class="mt-4 text-center text-sm text-surface-500">
      <router-link to="/login" class="text-primary-600 hover:underline">Back to log in</router-link>
    </p>
  </template>
</template>
