<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectsStore } from '../../stores/projects'
import { useClientsStore } from '../../stores/clients'
import { useTeamStore } from '../../stores/team'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { ProjectInput } from '../../types/project'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'
import Modal from '../../components/ui/Modal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import StatusPill from '../../components/ui/StatusPill.vue'

const route = useRoute()
const teamId = route.params.teamId as string
const projects = useProjectsStore()
const clients = useClientsStore()
const team = useTeamStore()
const ui = useUiStore()

const { loading, run: load } = useAsyncAction(async () => {
  await Promise.all([projects.fetchAll(teamId), clients.fetchAll(teamId)])
})
onMounted(load)

const showForm = ref(false)
const form = reactive<ProjectInput>({ clientId: '', name: '', currency: 'USD', startDate: null, endDate: null })

function openCreate(): void {
  Object.assign(form, { clientId: clients.items[0]?._id ?? '', name: '', currency: 'USD', startDate: null, endDate: null })
  showForm.value = true
}

const { loading: saving, run: save } = useAsyncAction(async () => {
  await projects.create(teamId, { ...form })
  ui.success('Project created.')
  showForm.value = false
})

function clientName(clientId: string): string {
  return clients.items.find((c) => c._id === clientId)?.name ?? 'Unknown client'
}
</script>

<template>
  <div>
    <div class="mb-5 flex items-center justify-between">
      <h1 class="text-lg font-semibold text-surface-900">Projects</h1>
      <AppButton v-if="team.isManager" :disabled="clients.items.length === 0" @click="openCreate">New project</AppButton>
    </div>
    <p v-if="team.isManager && !loading && clients.items.length === 0" class="mb-4 text-sm text-surface-500">
      Add a client first before creating a project.
    </p>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>
    <EmptyState v-else-if="projects.items.length === 0" title="No projects yet" />

    <ul v-else class="space-y-2">
      <li v-for="project in projects.items" :key="project._id">
        <router-link
          :to="{ name: 'project-detail', params: { teamId, projectId: project._id } }"
          class="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-4 py-3 hover:border-primary-300"
        >
          <div>
            <div class="font-medium text-surface-900">{{ project.name }}</div>
            <div class="text-xs text-surface-500">{{ clientName(project.clientId) }} · {{ project.currency }}</div>
          </div>
          <StatusPill :status="project.status" />
        </router-link>
      </li>
    </ul>

    <Modal v-if="showForm" title="New project" @close="showForm = false">
      <form id="project-form" class="space-y-4" @submit.prevent="save">
        <FormField label="Project name">
          <input v-model="form.name" required class="field-control" />
        </FormField>
        <FormField label="Client">
          <select v-model="form.clientId" required class="field-control">
            <option v-for="c in clients.items" :key="c._id" :value="c._id">{{ c.name }}</option>
          </select>
        </FormField>
        <FormField label="Currency" hint="3-letter ISO code, e.g. USD.">
          <input v-model="form.currency" required maxlength="3" class="field-control uppercase" />
        </FormField>
        <div class="grid grid-cols-2 gap-3">
          <FormField label="Start date">
            <input v-model="form.startDate" type="date" class="field-control" />
          </FormField>
          <FormField label="End date">
            <input v-model="form.endDate" type="date" class="field-control" />
          </FormField>
        </div>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showForm = false">Cancel</AppButton>
        <AppButton form="project-form" type="submit" :loading="saving">Create</AppButton>
      </template>
    </Modal>
  </div>
</template>
