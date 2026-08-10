import { api } from './api'
import type { Task, TaskInput, TaskStatus } from '../types/task'

export async function listTasks(teamId: string, projectId: string, status?: TaskStatus): Promise<Task[]> {
  const { data } = await api.get<{ tasks: Task[] }>(`/teams/${teamId}/projects/${projectId}/tasks`, {
    params: status ? { status } : undefined,
  })
  return data.tasks
}

export async function createTask(teamId: string, projectId: string, input: TaskInput): Promise<Task> {
  const { data } = await api.post<{ task: Task }>(`/teams/${teamId}/projects/${projectId}/tasks`, input)
  return data.task
}

export async function updateTask(
  teamId: string,
  projectId: string,
  taskId: string,
  input: Partial<TaskInput> & { status?: TaskStatus }
): Promise<Task> {
  const { data } = await api.patch<{ task: Task }>(`/teams/${teamId}/projects/${projectId}/tasks/${taskId}`, input)
  return data.task
}
