import { api } from './api'
import { downloadBlob } from './download'
import { ApiError } from '../types/common'
import type {
  Invoice,
  CreatePersonalInvoiceInput,
  CreateCollectiveInvoiceInput,
  UpdateInvoiceDraftInput,
  ListInvoicesFilter,
} from '../types/invoice'

export async function listInvoices(teamId: string, filter: ListInvoicesFilter = {}): Promise<Invoice[]> {
  const { data } = await api.get<{ invoices: Invoice[] }>(`/teams/${teamId}/invoices`, { params: filter })
  return data.invoices
}

export async function getInvoice(teamId: string, invoiceId: string): Promise<Invoice> {
  const { data } = await api.get<{ invoice: Invoice }>(`/teams/${teamId}/invoices/${invoiceId}`)
  return data.invoice
}

export async function createPersonalInvoice(teamId: string, input: CreatePersonalInvoiceInput): Promise<Invoice> {
  const { data } = await api.post<{ invoice: Invoice }>(`/teams/${teamId}/invoices`, input).catch((err) => {
    throw friendlyInvoiceNumberError(err)
  })
  return data.invoice
}

export async function createCollectiveInvoice(teamId: string, input: CreateCollectiveInvoiceInput): Promise<Invoice> {
  const { data } = await api.post<{ invoice: Invoice }>(`/teams/${teamId}/invoices/collective`, input).catch((err) => {
    throw friendlyInvoiceNumberError(err)
  })
  return data.invoice
}

export async function updateInvoiceDraft(
  teamId: string,
  invoiceId: string,
  input: UpdateInvoiceDraftInput
): Promise<Invoice> {
  const { data } = await api.patch<{ invoice: Invoice }>(`/teams/${teamId}/invoices/${invoiceId}`, input)
  return data.invoice
}

export async function deleteInvoiceDraft(teamId: string, invoiceId: string): Promise<void> {
  await api.delete(`/teams/${teamId}/invoices/${invoiceId}`)
}

export async function addTimeRecordToInvoice(teamId: string, invoiceId: string, timeRecordId: string): Promise<Invoice> {
  const { data } = await api.post<{ invoice: Invoice }>(`/teams/${teamId}/invoices/${invoiceId}/time-records`, {
    timeRecordId,
  })
  return data.invoice
}

export async function removeTimeRecordFromInvoice(teamId: string, invoiceId: string, recordId: string): Promise<Invoice> {
  const { data } = await api.delete<{ invoice: Invoice }>(
    `/teams/${teamId}/invoices/${invoiceId}/time-records/${recordId}`
  )
  return data.invoice
}

export async function addToPool(teamId: string, collectiveInvoiceId: string, personalInvoiceId: string): Promise<Invoice> {
  const { data } = await api.post<{ invoice: Invoice }>(
    `/teams/${teamId}/invoices/${collectiveInvoiceId}/pool/${personalInvoiceId}`
  )
  return data.invoice
}

export async function removeFromPool(teamId: string, collectiveInvoiceId: string, personalInvoiceId: string): Promise<Invoice> {
  const { data } = await api.delete<{ invoice: Invoice }>(
    `/teams/${teamId}/invoices/${collectiveInvoiceId}/pool/${personalInvoiceId}`
  )
  return data.invoice
}

export async function sendInvoice(teamId: string, invoiceId: string): Promise<Invoice> {
  const { data } = await api.post<{ invoice: Invoice }>(`/teams/${teamId}/invoices/${invoiceId}/send`)
  return data.invoice
}

export async function recordInvoicePayment(
  teamId: string,
  invoiceId: string,
  amount: number,
  date: string
): Promise<Invoice> {
  const { data } = await api.post<{ invoice: Invoice }>(`/teams/${teamId}/invoices/${invoiceId}/payment`, {
    amount,
    date,
  })
  return data.invoice
}

export async function downloadInvoicePdf(teamId: string, invoiceId: string, invoiceNumber: number): Promise<void> {
  const { data } = await api.get(`/teams/${teamId}/invoices/${invoiceId}/pdf`, { responseType: 'blob' })
  downloadBlob(data, `invoice-${invoiceNumber}.pdf`)
}

export async function downloadInvoiceCsv(teamId: string, invoiceId: string, invoiceNumber: number): Promise<void> {
  const { data } = await api.get(`/teams/${teamId}/invoices/${invoiceId}/csv`, { responseType: 'blob' })
  downloadBlob(data, `invoice-${invoiceNumber}.csv`)
}

// INV-15: the backend's per-team invoice-number counter isn't consistent with
// its globally-unique invoiceNumber index, so two teams' first invoices can
// collide and fail with a raw 500. Surface something actionable instead.
function friendlyInvoiceNumberError(err: unknown): unknown {
  if (err instanceof ApiError && err.status === 500) {
    return new ApiError(
      "Couldn't generate an invoice number just now — please try again.",
      err.code,
      err.status
    )
  }
  return err
}
