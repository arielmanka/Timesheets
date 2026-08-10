<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useAsyncAction } from '../../composables/useAsyncAction'
import FormField from '../../components/ui/FormField.vue'
import AppButton from '../../components/ui/AppButton.vue'

const auth = useAuthStore()

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const password = ref('')
const registered = ref(false)

const { loading, run } = useAsyncAction(async () => {
  await auth.register({
    firstName: firstName.value,
    lastName: lastName.value,
    email: email.value,
    password: password.value,
  })
  registered.value = true
})
</script>

<template>
  <div v-if="registered" class="text-center">
    <h1 class="mb-2 text-lg font-semibold text-surface-900">Check your inbox</h1>
    <p class="text-sm text-surface-600">
      We sent a verification link to <strong>{{ email }}</strong
      >. Follow it to activate your account, then log in.
    </p>
    <router-link to="/login" class="mt-4 inline-block text-sm text-primary-600 hover:underline">
      Back to log in
    </router-link>
  </div>

  <template v-else>
    <h1 class="mb-5 text-lg font-semibold text-surface-900">Create your account</h1>
    <form class="space-y-4" @submit.prevent="run">
      <div class="grid grid-cols-2 gap-3">
        <FormField label="First name">
          <input v-model="firstName" required autocomplete="given-name" class="field-control" />
        </FormField>
        <FormField label="Last name">
          <input v-model="lastName" required autocomplete="family-name" class="field-control" />
        </FormField>
      </div>
      <FormField label="Email">
        <input v-model="email" type="email" required autocomplete="email" class="field-control" />
      </FormField>
      <FormField label="Password" hint="At least 8 characters.">
        <input v-model="password" type="password" required minlength="8" autocomplete="new-password" class="field-control" />
      </FormField>
      <AppButton type="submit" class="w-full" :loading="loading">Create account</AppButton>
    </form>
    <p class="mt-4 text-center text-sm text-surface-500">
      Already have an account?
      <router-link to="/login" class="text-primary-600 hover:underline">Log in</router-link>
    </p>
  </template>
</template>
