import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as projectsService from '../services/projects.service'
import type { Project, ProjectInput, ProjectStatus } from '../types/project'

export const useProjectsStore = defineStore('projects', () => {
  const items = ref<Project[]>([])
  const loaded = ref(false)

  async function fetchAll(teamId: string, status?: ProjectStatus): Promise<void> {
    items.value = await projectsService.listProjects(teamId, status)
    loaded.value = true
  }

  async function create(teamId: string, input: ProjectInput): Promise<Project> {
    const project = await projectsService.createProject(teamId, input)
    items.value.unshift(project)
    return project
  }

  async function update(teamId: string, projectId: string, input: Partial<ProjectInput>): Promise<Project> {
    const project = await projectsService.updateProject(teamId, projectId, input)
    replace(project)
    return project
  }

  async function updateStatus(teamId: string, projectId: string, status: ProjectStatus): Promise<Project> {
    const project = await projectsService.updateProjectStatus(teamId, projectId, status)
    replace(project)
    return project
  }

  function replace(project: Project): void {
    const index = items.value.findIndex((p) => p._id === project._id)
    if (index !== -1) items.value[index] = project
  }

  function reset(): void {
    items.value = []
    loaded.value = false
  }

  return { items, loaded, fetchAll, create, update, updateStatus, reset }
})
