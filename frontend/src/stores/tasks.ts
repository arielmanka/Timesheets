import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as tasksService from '../services/tasks.service'
import type { Task, TaskInput, TaskStatus } from '../types/task'

export const useTasksStore = defineStore('tasks', () => {
  const items = ref<Task[]>([])
  const loaded = ref(false)

  async function fetchAll(teamId: string, projectId: string): Promise<void> {
    items.value = await tasksService.listTasks(teamId, projectId)
    loaded.value = true
  }

  async function create(teamId: string, projectId: string, input: TaskInput): Promise<Task> {
    const task = await tasksService.createTask(teamId, projectId, input)
    items.value.push(task)
    return task
  }

  async function update(
    teamId: string,
    projectId: string,
    taskId: string,
    input: Partial<TaskInput> & { status?: TaskStatus }
  ): Promise<Task> {
    const task = await tasksService.updateTask(teamId, projectId, taskId, input)
    const index = items.value.findIndex((t) => t._id === taskId)
    if (index !== -1) items.value[index] = task
    return task
  }

  function reset(): void {
    items.value = []
    loaded.value = false
  }

  return { items, loaded, fetchAll, create, update, reset }
})
