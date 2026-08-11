<script setup lang="ts">
import { ref } from 'vue'
import * as notificationsService from '../../services/notifications.service'
import { useNotificationsStore } from '../../stores/notifications'
import { useAsyncAction } from '../../composables/useAsyncAction'
import type { NotificationEntry } from '../../types/notification'
import LocalDate from '../../components/ui/LocalDate.vue'
import AppButton from '../../components/ui/AppButton.vue'
import EmptyState from '../../components/ui/EmptyState.vue'

const notificationsStore = useNotificationsStore()

const PAGE_SIZE = 50
const unreadOnly = ref(false)
const items = ref<NotificationEntry[]>([])
const total = ref(0)

const { loading, run: loadFirstPage } = useAsyncAction(async () => {
  const result = await notificationsService.listNotifications({ unreadOnly: unreadOnly.value, limit: PAGE_SIZE, skip: 0 })
  items.value = result.notifications
  total.value = result.total
  notificationsStore.unreadCount = result.unreadCount
})
loadFirstPage()

const { loading: loadingMore, run: loadMore } = useAsyncAction(async () => {
  const result = await notificationsService.listNotifications({ unreadOnly: unreadOnly.value, limit: PAGE_SIZE, skip: items.value.length })
  items.value = [...items.value, ...result.notifications]
  total.value = result.total
})

async function toggleUnreadOnly(): Promise<void> {
  unreadOnly.value = !unreadOnly.value
  await loadFirstPage()
}

async function handleMarkRead(entry: NotificationEntry): Promise<void> {
  if (entry.read) return
  entry.read = true
  await notificationsService.markNotificationRead(entry._id)
  notificationsStore.unreadCount = Math.max(0, notificationsStore.unreadCount - 1)
}

const { loading: markingAll, run: handleMarkAllRead } = useAsyncAction(async () => {
  await notificationsService.markAllNotificationsRead()
  items.value = items.value.map((n) => ({ ...n, read: true }))
  notificationsStore.unreadCount = 0
})

// Only entity types with an obvious place to jump to get a link; others
// (e.g. the personal missed-time-entry reminder) are informational only.
function entityLink(entry: NotificationEntry): { name: string; params: Record<string, string> } | null {
  if (!entry.teamId || !entry.entityId) return null
  if (entry.entityType === 'Invoice') return { name: 'invoice-detail', params: { teamId: entry.teamId, invoiceId: entry.entityId } }
  if (entry.entityType === 'Project') return { name: 'project-detail', params: { teamId: entry.teamId, projectId: entry.entityId } }
  if (entry.entityType === 'Team') return { name: 'approvals', params: { teamId: entry.teamId } }
  return null
}
</script>

<template>
  <div class="max-w-3xl space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold text-surface-900">Notifications</h1>
        <p class="mt-1 text-sm text-surface-500">
          Overdue invoices, missed weekly time entries, projects ending soon, and approval backlogs — configure what
          you're notified about in <router-link :to="{ name: 'account' }" class="underline">Account settings</router-link>.
        </p>
      </div>
      <AppButton variant="secondary" :loading="markingAll" @click="handleMarkAllRead">Mark all read</AppButton>
    </div>

    <button
      type="button"
      class="rounded-md border border-surface-300 px-3 py-1.5 text-sm font-medium text-surface-600 hover:border-primary-300"
      :class="unreadOnly ? '!border-primary-500 !text-primary-700' : ''"
      @click="toggleUnreadOnly"
    >
      {{ unreadOnly ? 'Showing unread only' : 'Show unread only' }}
    </button>

    <p v-if="loading" class="text-sm text-surface-500">Loading…</p>
    <EmptyState
      v-else-if="items.length === 0"
      title="No notifications"
      message="Nothing here yet — this fills up as the automation rules you've enabled find something worth flagging."
    />
    <template v-else>
      <ul class="space-y-2">
        <li
          v-for="entry in items"
          :key="entry._id"
          class="rounded-lg border bg-white p-4"
          :class="entry.read ? 'border-surface-200' : 'border-primary-300 bg-primary-500/5'"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span v-if="!entry.read" class="h-2 w-2 shrink-0 rounded-full bg-primary-500" aria-hidden="true" />
                <span class="font-medium text-surface-900">{{ entry.title }}</span>
              </div>
              <p class="mt-1 text-sm text-surface-600">{{ entry.message }}</p>
              <div class="mt-2 flex items-center gap-2 text-xs text-surface-400">
                <LocalDate :value="entry.createdAt" with-time />
                <router-link v-if="entityLink(entry)" :to="entityLink(entry)!" class="text-primary-600 hover:underline" @click="handleMarkRead(entry)">
                  View
                </router-link>
              </div>
            </div>
            <button
              v-if="!entry.read"
              type="button"
              class="shrink-0 text-xs font-medium text-surface-500 hover:text-surface-800"
              @click="handleMarkRead(entry)"
            >
              Mark read
            </button>
          </div>
        </li>
      </ul>

      <div class="flex items-center justify-between">
        <p class="text-xs text-surface-500">Showing {{ items.length }} of {{ total }}</p>
        <AppButton v-if="items.length < total" variant="secondary" :loading="loadingMore" @click="loadMore">
          Load more
        </AppButton>
      </div>
    </template>
  </div>
</template>
