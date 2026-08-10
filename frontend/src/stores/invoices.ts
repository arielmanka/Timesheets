import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as invoicesService from '../services/invoices.service'
import type {
  Invoice,
  CreatePersonalInvoiceInput,
  CreateCollectiveInvoiceInput,
  UpdateInvoiceDraftInput,
  ListInvoicesFilter,
} from '../types/invoice'

export const useInvoicesStore = defineStore('invoices', () => {
  const items = ref<Invoice[]>([])
  const loaded = ref(false)

  async function fetchAll(teamId: string, filter: ListInvoicesFilter = {}): Promise<void> {
    items.value = await invoicesService.listInvoices(teamId, filter)
    loaded.value = true
  }

  async function createPersonal(teamId: string, input: CreatePersonalInvoiceInput): Promise<Invoice> {
    const invoice = await invoicesService.createPersonalInvoice(teamId, input)
    items.value.unshift(invoice)
    return invoice
  }

  async function createCollective(teamId: string, input: CreateCollectiveInvoiceInput): Promise<Invoice> {
    const invoice = await invoicesService.createCollectiveInvoice(teamId, input)
    items.value.unshift(invoice)
    return invoice
  }

  async function updateDraft(teamId: string, invoiceId: string, input: UpdateInvoiceDraftInput): Promise<Invoice> {
    const invoice = await invoicesService.updateInvoiceDraft(teamId, invoiceId, input)
    replace(invoice)
    return invoice
  }

  async function remove(teamId: string, invoiceId: string): Promise<void> {
    await invoicesService.deleteInvoiceDraft(teamId, invoiceId)
    items.value = items.value.filter((i) => i._id !== invoiceId)
  }

  async function addTimeRecord(teamId: string, invoiceId: string, timeRecordId: string): Promise<Invoice> {
    const invoice = await invoicesService.addTimeRecordToInvoice(teamId, invoiceId, timeRecordId)
    replace(invoice)
    return invoice
  }

  async function removeTimeRecord(teamId: string, invoiceId: string, recordId: string): Promise<Invoice> {
    const invoice = await invoicesService.removeTimeRecordFromInvoice(teamId, invoiceId, recordId)
    replace(invoice)
    return invoice
  }

  async function addToPool(teamId: string, collectiveInvoiceId: string, personalInvoiceId: string): Promise<Invoice> {
    const invoice = await invoicesService.addToPool(teamId, collectiveInvoiceId, personalInvoiceId)
    replace(invoice)
    return invoice
  }

  async function removeFromPool(teamId: string, collectiveInvoiceId: string, personalInvoiceId: string): Promise<Invoice> {
    const invoice = await invoicesService.removeFromPool(teamId, collectiveInvoiceId, personalInvoiceId)
    replace(invoice)
    return invoice
  }

  async function send(teamId: string, invoiceId: string): Promise<Invoice> {
    const invoice = await invoicesService.sendInvoice(teamId, invoiceId)
    replace(invoice)
    return invoice
  }

  async function recordPayment(teamId: string, invoiceId: string, amount: number, date: string): Promise<Invoice> {
    const invoice = await invoicesService.recordInvoicePayment(teamId, invoiceId, amount, date)
    replace(invoice)
    return invoice
  }

  function replace(invoice: Invoice): void {
    const index = items.value.findIndex((i) => i._id === invoice._id)
    if (index !== -1) items.value[index] = invoice
    else items.value.unshift(invoice)
  }

  function reset(): void {
    items.value = []
    loaded.value = false
  }

  return {
    items,
    loaded,
    fetchAll,
    createPersonal,
    createCollective,
    updateDraft,
    remove,
    addTimeRecord,
    removeTimeRecord,
    addToPool,
    removeFromPool,
    send,
    recordPayment,
    reset,
  }
})
