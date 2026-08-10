import { api } from './api'
import type { Client, ClientInput } from '../types/client'

export async function listClients(teamId: string): Promise<Client[]> {
  const { data } = await api.get<{ clients: Client[] }>(`/teams/${teamId}/clients`)
  return data.clients
}

export async function getClient(teamId: string, clientId: string): Promise<Client> {
  const { data } = await api.get<{ client: Client }>(`/teams/${teamId}/clients/${clientId}`)
  return data.client
}

export async function createClient(teamId: string, input: ClientInput): Promise<Client> {
  const { data } = await api.post<{ client: Client }>(`/teams/${teamId}/clients`, input)
  return data.client
}

export async function updateClient(teamId: string, clientId: string, input: Partial<ClientInput>): Promise<Client> {
  const { data } = await api.patch<{ client: Client }>(`/teams/${teamId}/clients/${clientId}`, input)
  return data.client
}
