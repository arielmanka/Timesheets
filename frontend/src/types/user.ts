import type { ID } from './common'

export interface User {
  _id: ID
  uid: string
  email: string
  emailVerified: boolean
  firstName: string
  lastName: string
  locale: string
  deletionRequestedAt: string | null
  createdAt: string
  updatedAt: string
}
