import type { ID } from './common'

export type InvoiceType = 'personal' | 'collective'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue'

export interface LineItem {
  description: string
  hours: number
  rate: number
  /** Gross amount. For a collective invoice's rolled-up personal-invoice line, this is that invoice's own gross total. */
  amount: number
  /** Net (pre-tax) amount and the VAT rate charged — set only on a collective invoice's rolled-up personal-invoice lines. */
  netAmount: number | null
  taxRate: number | null
  timeRecordId: ID | null
  personalInvoiceId: ID | null
}

export interface ManualItem {
  description: string
  amount: number
}

export interface TaxEntry {
  name: string
  rate: number
  amount: number
}

export interface Payment {
  amount: number
  date: string
  recordedBy: ID
}

export interface Invoice {
  _id: ID
  /** Format: yyyymmdd-NNNNNN (creation date + a never-resetting 6-digit per-team sequence). */
  invoiceNumber: string
  type: InvoiceType
  teamId: ID
  /** Personal invoices only — collective invoices span every project a client has. */
  projectId: ID | null
  clientId: ID
  createdBy: ID
  status: InvoiceStatus
  timeRecordIds: ID[]
  personalInvoiceIds: ID[]
  /** Personal invoices only: the collective invoice currently pooling this one, if any. */
  includedInCollectiveInvoiceId: ID | null
  lineItems: LineItem[]
  manualItems: ManualItem[]
  notes: string | null
  subtotal: number
  taxes: TaxEntry[]
  totalTax: number
  total: number
  currency: string
  partialPaymentAmount: number | null
  paymentDate: string | null
  payments: Payment[]
  /** For a collective invoice, the client-billed period chosen at creation; for a personal invoice, auto-derived from its included time records. */
  period: { startDate: string; endDate: string } | null
  dueDate: string | null
  paymentTerms: string | null
  /** Free-text legal mention (e.g. reverse charge) for exempt or intra-EU transactions. */
  taxNote: string | null
  reconciled: boolean
  createdAt: string
  updatedAt: string
}

export interface ManualItemInput {
  description: string
  amount: number
}

export interface TaxRuleInput {
  name: string
  rate: number
}

export interface CreatePersonalInvoiceInput {
  projectId: string
  timeRecordIds: string[]
  notes?: string | null
  manualItems?: ManualItemInput[]
  taxRules?: TaxRuleInput[]
  dueDate?: string | null
  paymentTerms?: string | null
  taxNote?: string | null
}

export interface CreateCollectiveInvoiceInput {
  clientId: string
  period: { startDate: string; endDate: string }
  personalInvoiceIds?: string[]
  notes?: string | null
  manualItems?: ManualItemInput[]
  dueDate?: string | null
  paymentTerms?: string | null
  taxNote?: string | null
}

export interface UpdateInvoiceDraftInput {
  notes?: string | null
  manualItems?: ManualItemInput[]
  taxRules?: TaxRuleInput[]
  dueDate?: string | null
  paymentTerms?: string | null
  taxNote?: string | null
}

export interface ListInvoicesFilter {
  type?: 'personal' | 'collective'
  status?: InvoiceStatus
  projectId?: string
  clientId?: string
  createdBy?: string
  /** Personal invoices not currently included in any collective invoice's pool. */
  unpooled?: boolean
}
