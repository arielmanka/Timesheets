<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { BankAccountDetails } from '../../types/user'
import FormField from '../ui/FormField.vue'

// Deliberately generic — IBAN/SWIFT for EU accounts, routing+account number
// for North American ones, otherDetails as a free-text fallback. Emits null
// once every field is blank, so an account can be cleared entirely.
const model = defineModel<BankAccountDetails | null>({ required: true })

const form = reactive({
  accountHolderName: '',
  bankName: '',
  country: '',
  iban: '',
  swiftBic: '',
  routingNumber: '',
  accountNumber: '',
  otherDetails: '',
})

watch(
  () => model.value,
  (val) => {
    form.accountHolderName = val?.accountHolderName ?? ''
    form.bankName = val?.bankName ?? ''
    form.country = val?.country ?? ''
    form.iban = val?.iban ?? ''
    form.swiftBic = val?.swiftBic ?? ''
    form.routingNumber = val?.routingNumber ?? ''
    form.accountNumber = val?.accountNumber ?? ''
    form.otherDetails = val?.otherDetails ?? ''
  },
  { immediate: true }
)

watch(form, () => {
  const isBlank = Object.values(form).every((v) => !v)
  model.value = isBlank
    ? null
    : {
        accountHolderName: form.accountHolderName,
        bankName: form.bankName,
        country: form.country,
        iban: form.iban || null,
        swiftBic: form.swiftBic || null,
        routingNumber: form.routingNumber || null,
        accountNumber: form.accountNumber || null,
        otherDetails: form.otherDetails || null,
      }
})
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-2 gap-3">
      <FormField label="Account holder name">
        <input v-model="form.accountHolderName" class="field-control" />
      </FormField>
      <FormField label="Bank name">
        <input v-model="form.bankName" class="field-control" />
      </FormField>
    </div>
    <FormField label="Country">
      <input v-model="form.country" class="field-control" />
    </FormField>
    <div class="grid grid-cols-2 gap-3">
      <FormField label="IBAN" hint="EU accounts">
        <input v-model="form.iban" class="field-control" />
      </FormField>
      <FormField label="SWIFT / BIC">
        <input v-model="form.swiftBic" class="field-control" />
      </FormField>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <FormField label="Routing number" hint="North American accounts">
        <input v-model="form.routingNumber" class="field-control" />
      </FormField>
      <FormField label="Account number">
        <input v-model="form.accountNumber" class="field-control" />
      </FormField>
    </div>
    <FormField label="Other details" hint="Sort code, IFSC, correspondent bank info, etc.">
      <textarea v-model="form.otherDetails" rows="2" class="field-control" />
    </FormField>
  </div>
</template>
