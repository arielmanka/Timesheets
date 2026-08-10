import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as clientsService from '../services/clients.service'
import type { Client, ClientInput } from '../types/client'

export const useClientsStore = defineStore('clients', () => {
  const items = ref<Client[]>([])
  const loaded = ref(false)

  async function fetchAll(teamId: string): Promise<void> {
    items.value = await clientsService.listClients(teamId)
    loaded.value = true
  }

  async function create(teamId: string, input: ClientInput): Promise<Client> {
    const client = await clientsService.createClient(teamId, input)
    items.value.push(client)
    return client
  }

  async function update(teamId: string, clientId: string, input: Partial<ClientInput>): Promise<Client> {
    const client = await clientsService.updateClient(teamId, clientId, input)
    const index = items.value.findIndex((c) => c._id === clientId)
    if (index !== -1) items.value[index] = client
    return client
  }

  function reset(): void {
    items.value = []
    loaded.value = false
  }

  return { items, loaded, fetchAll, create, update, reset }
})
