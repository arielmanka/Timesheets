import type { ID } from './common'

export interface BillingAddress {
  line1: string
  line2: string | null
  city: string
  state: string
  postalCode: string
  country: string
}

export interface Client {
  _id: ID
  teamId: ID
  name: string
  billingContact: string
  billingEmail: string
  billingAddress: BillingAddress
  taxId: string | null
  createdAt: string
  updatedAt: string
}

export interface ClientInput {
  name: string
  billingContact: string
  billingEmail: string
  billingAddress: BillingAddress
  taxId?: string | null
}
