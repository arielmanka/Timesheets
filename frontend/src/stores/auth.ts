import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authService from '../services/auth.service'
import * as usersService from '../services/users.service'
import { restoreSession } from '../services/api'
import type { User } from '../types/user'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const initialized = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  /** Runs once on app boot — trades a stored refresh token for a session, if one exists. */
  async function initialize(): Promise<void> {
    if (initialized.value) return
    const restored = await restoreSession()
    if (restored) {
      try {
        user.value = await usersService.getMyProfile()
      } catch {
        user.value = null
      }
    }
    initialized.value = true
  }

  async function login(email: string, password: string): Promise<void> {
    const result = await authService.login(email, password)
    user.value = result.user
  }

  async function register(input: { email: string; password: string; firstName: string; lastName: string }) {
    return authService.register(input)
  }

  async function logout(): Promise<void> {
    await authService.logout()
    user.value = null
  }

  async function refreshProfile(): Promise<void> {
    user.value = await usersService.getMyProfile()
  }

  function setUser(next: User): void {
    user.value = next
  }

  return { user, initialized, isAuthenticated, initialize, login, register, logout, refreshProfile, setUser }
})
