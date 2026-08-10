import type { ID } from './common'
import type { BillingAddress } from './client'

export type EmploymentType = 'employee' | 'contractor'

export interface IncorporationDetails {
  companyName: string
  address: BillingAddress
  taxId: string
  phone: string | null
}

// Deliberately generic — IBAN/SWIFT for EU accounts, routing+account number
// for North American ones, otherDetails as a free-text fallback for anything
// else (sort codes, IFSC, correspondent bank info, etc.).
export interface BankAccountDetails {
  accountHolderName: string
  bankName: string
  country: string
  iban: string | null
  swiftBic: string | null
  routingNumber: string | null
  accountNumber: string | null
  otherDetails: string | null
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
  // A manager may also personally invoice their own time on a team, so these
  // are kept separate: one account paid as an individual contributor,
  // another to receive payment on the team's behalf on a collective invoice.
  personalBankAccount: BankAccountDetails | null
  collectiveBankAccount: BankAccountDetails | null
  deletionRequestedAt: string | null
  createdAt: string
  updatedAt: string
}
