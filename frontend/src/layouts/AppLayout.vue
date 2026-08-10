<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTeamStore } from '../stores/team'
import ToastStack from '../components/ui/ToastStack.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const team = useTeamStore()

const teamId = computed(() => route.params.teamId as string | undefined)
const userMenuOpen = ref(false)

const navLinks = computed(() => {
  if (!teamId.value) return []
  const links = [
    { name: 'time', label: 'Time' },
    { name: 'approvals', label: 'Approvals', managerOnly: true },
    { name: 'clients', label: 'Clients' },
    { name: 'projects', label: 'Projects' },
    { name: 'invoices', label: 'Invoices' },
    { name: 'invoicing-pool', label: 'Invoicing Pool', managerOnly: true },
    { name: 'reports', label: 'Reports' },
    { name: 'team-members', label: 'Members' },
  ]
  return links.filter((l) => !l.managerOnly || team.isManager)
})

async function handleLogout(): Promise<void> {
  await auth.logout()
  team.reset()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen bg-surface-50">
    <header class="sticky top-0 z-40 border-b border-surface-200 bg-white">
      <div class="flex h-14 items-center gap-4 px-4">
        <router-link to="/teams" class="shrink-0 text-sm font-semibold tracking-tight text-surface-900">
          Timesheets
        </router-link>

        <router-link
          v-if="teamId && team.current"
          to="/teams"
          class="shrink-0 truncate rounded-md bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-600 hover:bg-surface-200"
          title="Switch team"
        >
          {{ team.current.name }}
        </router-link>

        <nav v-if="navLinks.length" class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap">
          <router-link
            v-for="link in navLinks"
            :key="link.name"
            :to="{ name: link.name, params: { teamId } }"
            class="rounded-md px-2.5 py-1.5 text-sm font-medium text-surface-600 hover:bg-surface-100 hover:text-surface-900"
            active-class="!bg-primary-500/10 !text-primary-700"
          >
            {{ link.label }}
          </router-link>
        </nav>
        <div v-else class="flex-1" />

        <div class="relative shrink-0">
          <button
            type="button"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-surface-700 hover:bg-surface-100"
            @click="userMenuOpen = !userMenuOpen"
          >
            <span class="max-w-[10rem] truncate">{{ auth.user?.firstName }} {{ auth.user?.lastName }}</span>
            <svg class="h-4 w-4 text-surface-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
            </svg>
          </button>
          <div
            v-if="userMenuOpen"
            class="absolute right-0 mt-1 w-44 rounded-md border border-surface-200 bg-white py-1 shadow-lg"
            @click="userMenuOpen = false"
          >
            <router-link to="/account" class="block px-3 py-1.5 text-sm text-surface-700 hover:bg-surface-100">
              Account
            </router-link>
            <button
              type="button"
              class="block w-full px-3 py-1.5 text-left text-sm text-surface-700 hover:bg-surface-100"
              @click="handleLogout"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-6">
      <slot />
    </main>

    <ToastStack />
  </div>
</template>
