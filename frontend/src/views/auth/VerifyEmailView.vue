<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import * as authService from '../../services/auth.service'
import { ApiError } from '../../types/common'
import AppButton from '../../components/ui/AppButton.vue'

const route = useRoute()

type Status = 'pending' | 'verifying' | 'success' | 'error'
const status = ref<Status>('pending')
const errorMessage = ref('')

async function verify(token: string): Promise<void> {
  status.value = 'verifying'
  try {
    await authService.verifyEmail(token)
    status.value = 'success'
  } catch (err) {
    status.value = 'error'
    errorMessage.value = err instanceof ApiError ? err.message : 'Verification failed.'
  }
}

onMounted(() => {
  const token = route.params.token as string | undefined
  if (token) verify(token)
})
</script>

<template>
  <div class="text-center">
    <template v-if="status === 'pending' || status === 'verifying'">
      <h1 class="mb-2 text-lg font-semibold text-surface-900">Verifying your email…</h1>
      <p class="text-sm text-surface-500">This only takes a moment.</p>
    </template>

    <template v-else-if="status === 'success'">
      <h1 class="mb-2 text-lg font-semibold text-surface-900">Email verified</h1>
      <p class="mb-4 text-sm text-surface-600">Your account is active. You can log in now.</p>
      <router-link to="/login"><AppButton>Go to login</AppButton></router-link>
    </template>

    <template v-else>
      <h1 class="mb-2 text-lg font-semibold text-surface-900">Verification failed</h1>
      <p class="mb-4 text-sm text-surface-600">{{ errorMessage }}</p>
      <router-link to="/login" class="text-sm text-primary-600 hover:underline">Back to log in</router-link>
    </template>
  </div>
</template>
