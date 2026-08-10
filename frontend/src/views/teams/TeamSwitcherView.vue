<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTeamStore } from '../../stores/team'
import * as teamsService from '../../services/teams.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'
import Modal from '../../components/ui/Modal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const router = useRouter()
const team = useTeamStore()

const { loading, run: load } = useAsyncAction(() => team.fetchMyTeams())
onMounted(load)

const showCreate = ref(false)
const newTeamName = ref('')
const { loading: creating, run: create } = useAsyncAction(async () => {
  const created = await teamsService.createTeam(newTeamName.value)
  newTeamName.value = ''
  showCreate.value = false
  await team.fetchMyTeams()
  router.push({ name: 'time', params: { teamId: created._id } })
})

function open(teamId: string): void {
  router.push({ name: 'time', params: { teamId } })
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <div class="mb-5 flex items-center justify-between">
      <h1 class="text-lg font-semibold text-surface-900">Your teams</h1>
      <AppButton @click="showCreate = true">New team</AppButton>
    </div>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>

    <EmptyState
      v-else-if="team.teams.length === 0"
      title="No teams yet"
      message="Create a team to start tracking time, or ask a manager for your user ID so they can add you to theirs."
    />

    <ul v-else class="space-y-2">
      <li v-for="t in team.teams" :key="t._id">
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-lg border border-surface-200 bg-white px-4 py-3 text-left hover:border-primary-300 hover:bg-primary-500/5"
          @click="open(t._id)"
        >
          <span class="font-medium text-surface-900">{{ t.name }}</span>
          <span class="text-xs text-surface-400">{{ t.members.length }} member{{ t.members.length === 1 ? '' : 's' }}</span>
        </button>
      </li>
    </ul>

    <Modal v-if="showCreate" title="New team" @close="showCreate = false">
      <form id="create-team-form" class="space-y-4" @submit.prevent="create">
        <FormField label="Team name">
          <input v-model="newTeamName" required autofocus class="field-control" />
        </FormField>
      </form>
      <template #footer>
        <AppButton variant="secondary" @click="showCreate = false">Cancel</AppButton>
        <AppButton form="create-team-form" type="submit" :loading="creating">Create</AppButton>
      </template>
    </Modal>
  </div>
</template>
