<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTeamStore } from '../../stores/team'
import { useAuthStore } from '../../stores/auth'
import * as teamsService from '../../services/teams.service'
import { useAsyncAction } from '../../composables/useAsyncAction'
import { useUiStore } from '../../stores/ui'
import type { UserSearchResult, TeamMember } from '../../types/team'
import AppButton from '../../components/ui/AppButton.vue'
import FormField from '../../components/ui/FormField.vue'
import RateField from '../../components/ui/RateField.vue'
import ConfirmDialog from '../../components/ui/ConfirmDialog.vue'

const route = useRoute()
const team = useTeamStore()
const auth = useAuthStore()
const ui = useUiStore()
const teamId = route.params.teamId as string

// --- Add member by UID ---------------------------------------------------
const searchUid = ref('')
const foundUser = ref<UserSearchResult | null>(null)
const { loading: searching, run: search } = useAsyncAction(async () => {
  foundUser.value = await teamsService.searchUserByUid(teamId, searchUid.value.trim())
})
const { loading: adding, run: addFoundUser } = useAsyncAction(async () => {
  if (!foundUser.value) return
  await teamsService.addMember(teamId, foundUser.value.uid)
  ui.success(`${foundUser.value.firstName} ${foundUser.value.lastName} added to the team.`)
  foundUser.value = null
  searchUid.value = ''
  await team.refreshCurrent()
})

// --- Rate editing ----------------------------------------------------------
const editingRateFor = ref<string | null>(null)
const rateDraft = ref('')
const { loading: savingRate, run: saveRate } = useAsyncAction(async (userId: string) => {
  const value = rateDraft.value.trim() === '' ? null : Number(rateDraft.value)
  await teamsService.setMemberRate(teamId, userId, value)
  editingRateFor.value = null
  await team.refreshCurrent()
})
function startEditRate(member: TeamMember): void {
  editingRateFor.value = member.userId
  rateDraft.value = member.hourlyRate === null ? '' : String(member.hourlyRate)
}

// --- Role toggle -------------------------------------------------------
// Confirmed, not a bare click: a role change is as consequential as removing
// someone, and self-demotion in particular only takes one accidental click
// once a second manager exists (the backend's sole-manager guard no longer
// applies once you're not the last one).
const roleTarget = ref<TeamMember | null>(null)
const { loading: changingRole, run: confirmRoleChange } = useAsyncAction(async () => {
  if (!roleTarget.value) return
  const nextRole = roleTarget.value.role === 'manager' ? 'member' : 'manager'
  await teamsService.setMemberRole(teamId, roleTarget.value.userId, nextRole)
  roleTarget.value = null
  await team.refreshCurrent()
})

// --- Remove member -------------------------------------------------------
const removeTarget = ref<TeamMember | null>(null)
const { loading: removing, run: confirmRemove } = useAsyncAction(async () => {
  if (!removeTarget.value) return
  await teamsService.removeMember(teamId, removeTarget.value.userId)
  removeTarget.value = null
  await team.refreshCurrent()
})
</script>

<template>
  <div class="max-w-3xl">
    <h1 class="mb-5 text-lg font-semibold text-surface-900">Team members</h1>

    <div v-if="team.isManager" class="mb-6 rounded-lg border border-surface-200 bg-white p-4">
      <h2 class="mb-3 text-sm font-semibold text-surface-800">Add a member</h2>
      <form class="flex items-end gap-2" @submit.prevent="search">
        <FormField label="User ID (24-character UID)" class="flex-1">
          <input v-model="searchUid" required minlength="24" maxlength="24" class="field-control font-mono" />
        </FormField>
        <AppButton type="submit" variant="secondary" :loading="searching">Find</AppButton>
      </form>

      <div v-if="foundUser" class="mt-3 flex items-center justify-between rounded-md bg-surface-50 px-3 py-2">
        <span class="text-sm text-surface-700">{{ foundUser.firstName }} {{ foundUser.lastName }} — {{ foundUser.email }}</span>
        <AppButton :loading="adding" @click="addFoundUser">Add to team</AppButton>
      </div>
    </div>

    <div class="overflow-x-auto rounded-lg border border-surface-200 bg-white">
      <table class="w-full text-sm">
        <thead class="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-surface-500">
          <tr>
            <th class="px-4 py-2.5 font-medium">Name</th>
            <th class="px-4 py-2.5 font-medium">Role</th>
            <th class="px-4 py-2.5 font-medium">Rate</th>
            <th v-if="team.isManager" class="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-surface-100">
          <tr v-for="member in team.current?.members" :key="member.userId">
            <td class="px-4 py-2.5">
              <div class="font-medium text-surface-900">
                {{ member.firstName }} {{ member.lastName }}
                <span v-if="member.userId === auth.user?._id" class="font-normal text-surface-400">(You)</span>
              </div>
              <div class="text-xs text-surface-500">{{ member.email }}</div>
            </td>
            <td class="px-4 py-2.5">
              <button
                v-if="team.isManager"
                type="button"
                class="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize hover:opacity-80"
                :class="member.role === 'manager' ? 'bg-primary-500/10 text-primary-700' : 'bg-surface-200 text-surface-700'"
                :title="`Click to make ${member.role === 'manager' ? 'a member' : 'a manager'}`"
                @click="roleTarget = member"
              >
                {{ member.role }}
              </button>
              <span v-else class="capitalize text-surface-600">{{ member.role }}</span>
            </td>
            <td class="px-4 py-2.5">
              <template v-if="team.isManager && editingRateFor === member.userId">
                <div class="flex items-center gap-1">
                  <input v-model="rateDraft" type="number" step="0.01" min="0" class="field-control w-24 py-1" />
                  <AppButton variant="ghost" :loading="savingRate" @click="saveRate(member.userId)">Save</AppButton>
                </div>
              </template>
              <button
                v-else-if="team.isManager"
                type="button"
                class="hover:underline"
                @click="startEditRate(member)"
              >
                <RateField :amount="member.hourlyRate" />
              </button>
              <RateField v-else :amount="member.hourlyRate" />
            </td>
            <td v-if="team.isManager" class="px-4 py-2.5 text-right">
              <AppButton
                v-if="member.userId !== auth.user?._id"
                variant="ghost"
                @click="removeTarget = member"
              >
                Remove
              </AppButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      v-if="removeTarget"
      title="Remove member"
      :message="`Remove ${removeTarget.firstName} ${removeTarget.lastName} from this team?`"
      confirm-label="Remove"
      danger
      :loading="removing"
      @confirm="confirmRemove"
      @cancel="removeTarget = null"
    />

    <ConfirmDialog
      v-if="roleTarget"
      :title="roleTarget.role === 'manager' ? 'Remove manager access' : 'Grant manager access'"
      :message="
        roleTarget.userId === auth.user?._id && roleTarget.role === 'manager'
          ? `You're about to remove your own manager access. You'll immediately lose the ability to manage clients, projects, members, and approvals for this team — another manager would need to restore it. Continue?`
          : `Make ${roleTarget.firstName} ${roleTarget.lastName} a ${roleTarget.role === 'manager' ? 'member' : 'manager'}?`
      "
      :confirm-label="roleTarget.role === 'manager' ? 'Remove access' : 'Make manager'"
      :danger="roleTarget.role === 'manager'"
      :loading="changingRole"
      @confirm="confirmRoleChange"
      @cancel="roleTarget = null"
    />
  </div>
</template>
