import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as notificationsService from '../services/notifications.service'

// Holds just the unread count for the header badge — the inbox page itself
// fetches its own paginated list separately.
export const useNotificationsStore = defineStore('notifications', () => {
  const unreadCount = ref(0)

  async function refreshUnreadCount(): Promise<void> {
    const result = await notificationsService.listNotifications({ unreadOnly: true, limit: 1 })
    unreadCount.value = result.unreadCount
  }

  function reset(): void {
    unreadCount.value = 0
  }

  return { unreadCount, refreshUnreadCount, reset }
})
