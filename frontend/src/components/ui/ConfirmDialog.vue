<script setup lang="ts">
import Modal from './Modal.vue'
import AppButton from './AppButton.vue'

withDefaults(
  defineProps<{ title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean }>(),
  { confirmLabel: 'Confirm', danger: false, loading: false }
)
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <Modal :title="title" @close="emit('cancel')">
    <p class="text-sm text-surface-600">{{ message }}</p>
    <template #footer>
      <AppButton variant="secondary" @click="emit('cancel')">Cancel</AppButton>
      <AppButton :variant="danger ? 'danger' : 'primary'" :loading="loading" @click="emit('confirm')">
        {{ confirmLabel }}
      </AppButton>
    </template>
  </Modal>
</template>
