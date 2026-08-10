import { api } from './api'
import type { Project, ProjectInput, ProjectStatus } from '../types/project'

export async function listProjects(teamId: string, status?: ProjectStatus): Promise<Project[]> {
  const { data } = await api.get<{ projects: Project[] }>(`/teams/${teamId}/projects`, {
    params: status ? { status } : undefined,
  })
  return data.projects
}

export async function getProject(teamId: string, projectId: string): Promise<Project> {
  const { data } = await api.get<{ project: Project }>(`/teams/${teamId}/projects/${projectId}`)
  return data.project
}

export async function createProject(teamId: string, input: ProjectInput): Promise<Project> {
  const { data } = await api.post<{ project: Project }>(`/teams/${teamId}/projects`, input)
  return data.project
}

export async function updateProject(
  teamId: string,
  projectId: string,
  input: Partial<ProjectInput>
): Promise<Project> {
  const { data } = await api.patch<{ project: Project }>(`/teams/${teamId}/projects/${projectId}`, input)
  return data.project
}

export async function updateProjectStatus(teamId: string, projectId: string, status: ProjectStatus): Promise<Project> {
  const { data } = await api.patch<{ project: Project }>(`/teams/${teamId}/projects/${projectId}/status`, { status })
  return data.project
}
