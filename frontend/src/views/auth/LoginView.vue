<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useAsyncAction } from '../../composables/useAsyncAction'
import FormField from '../../components/ui/FormField.vue'
import AppButton from '../../components/ui/AppButton.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')

const { loading, run } = useAsyncAction(async () => {
  await auth.login(email.value, password.value)
  const redirect = (route.query.redirect as string) || '/teams'
  router.push(redirect)
})
</script>

<template>
  <h1 class="mb-5 text-lg font-semibold text-surface-900">Log in</h1>
  <form class="space-y-4" @submit.prevent="run">
    <FormField label="Email">
      <input v-model="email" type="email" required autocomplete="email" class="field-control" />
    </FormField>
    <FormField label="Password">
      <input v-model="password" type="password" required autocomplete="current-password" class="field-control" />
    </FormField>
    <AppButton type="submit" class="w-full" :loading="loading">Log in</AppButton>
  </form>
  <div class="mt-4 flex justify-between text-sm text-surface-500">
    <router-link to="/register" class="hover:text-primary-600">Create an account</router-link>
    <router-link to="/forgot-password" class="hover:text-primary-600">Forgot password?</router-link>
  </div>
</template>
