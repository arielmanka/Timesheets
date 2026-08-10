import type { ID } from './common'
import type { BillingAddress } from './client'

export type EmploymentType = 'employee' | 'contractor'

export interface IncorporationDetails {
  companyName: string
  address: BillingAddress
  taxId: string
}

export interface User {
  _id: ID
  uid: string
  email: string
  emailVerified: boolean
  firstName: string
  lastName: string
  locale: string
  employmentType: EmploymentType
  incorporation: IncorporationDetails | null
  deletionRequestedAt: string | null
  createdAt: string
  updatedAt: string
}
