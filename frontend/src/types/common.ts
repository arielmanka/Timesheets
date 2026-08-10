export type ID = string

export interface ApiErrorBody {
  error: {
    message: string
    code: string
    stack?: string
  }
}

/** Normalized shape thrown by the api client for every failed request. */
export class ApiError extends Error {
  code: string
  status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}
