import type { BankAccountDetails } from '../types/user'

// Mirrors the backend's isBankAccountComplete (models/shared/bankAccount.ts)
// — a bank account is only usable on an invoice once it identifies both who
// holds it and at least one real way to route a payment to it.
export function isBankAccountComplete(account: BankAccountDetails | null | undefined): boolean {
  if (!account) return false
  if (!account.accountHolderName || !account.bankName || !account.country) return false
  return !!(account.iban || (account.routingNumber && account.accountNumber) || account.otherDetails)
}
