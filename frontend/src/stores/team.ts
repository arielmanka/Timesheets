import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as teamsService from '../services/teams.service'
import { useAuthStore } from './auth'
import { useClientsStore } from './clients'
import { useProjectsStore } from './projects'
import { useTasksStore } from './tasks'
import { useTimeRecordsStore } from './timeRecords'
import { useInvoicesStore } from './invoices'
import type { TeamSummary, TeamDetail, TeamRole } from '../types/team'

const LAST_TEAM_STORAGE_KEY = 'timesheets.lastTeamId'

export const useTeamStore = defineStore('team', () => {
  const auth = useAuthStore()

  // Every store below is scoped to "the current team" but has no idea when
  // that team changes — each one only refetches if its own `loaded` flag is
  // still false. Without resetting them here, switching teams leaves every
  // view showing the previous team's cached projects/clients/etc. until
  // something else happens to force a refetch (e.g. visiting a list view
  // that always fetches unconditionally).
  function resetDomainStores(): void {
    useClientsStore().reset()
    useProjectsStore().reset()
    useTasksStore().reset()
    useTimeRecordsStore().reset()
    useInvoicesStore().reset()
  }

  const teams = ref<TeamSummary[]>([])
  const current = ref<TeamDetail | null>(null)
  const teamsLoaded = ref(false)

  const currentTeamId = computed(() => current.value?._id ?? null)

  const currentRole = computed<TeamRole | null>(() => {
    if (!current.value || !auth.user) return null
    return current.value.members.find((m) => m.userId === auth.user!._id)?.role ?? null
  })

  const isManager = computed(() => currentRole.value === 'manager')

  async function fetchMyTeams(): Promise<void> {
    teams.value = await teamsService.listMyTeams()
    teamsLoaded.value = true
  }

  async function selectTeam(teamId: string): Promise<void> {
    if (current.value && current.value._id !== teamId) {
      resetDomainStores()
    }
    current.value = await teamsService.getTeam(teamId)
    localStorage.setItem(LAST_TEAM_STORAGE_KEY, teamId)
  }

  async function refreshCurrent(): Promise<void> {
    if (!current.value) return
    current.value = await teamsService.getTeam(current.value._id)
  }

  function lastSelectedTeamId(): string | null {
    return localStorage.getItem(LAST_TEAM_STORAGE_KEY)
  }

  function clearCurrent(): void {
    current.value = null
  }

  function reset(): void {
    teams.value = []
    current.value = null
    teamsLoaded.value = false
    resetDomainStores()
  }

  return {
    teams,
    current,
    teamsLoaded,
    currentTeamId,
    currentRole,
    isManager,
    fetchMyTeams,
    selectTeam,
    refreshCurrent,
    lastSelectedTeamId,
    clearCurrent,
    reset,
  }
})
