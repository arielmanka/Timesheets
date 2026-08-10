import { Schema } from 'mongoose';

// ---------------------------------------------------------------------------
// Bank account details for receiving invoice payments. Deliberately generic
// rather than IBAN-only or routing/account-only — a team can have EU-based
// contractors (IBAN + BIC/SWIFT) and North American ones (routing + account
// number) side by side, and `otherDetails` is a free-text escape hatch for
// anything else (sort codes, IFSC, correspondent bank info, etc.).
// ---------------------------------------------------------------------------
export interface IBankAccountDetails {
  accountHolderName: string;
  bankName: string;
  country: string;
  iban: string | null;
  swiftBic: string | null;
  routingNumber: string | null;
  accountNumber: string | null;
  otherDetails: string | null;
}

export const bankAccountSchema = new Schema<IBankAccountDetails>(
  {
    accountHolderName: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    iban: { type: String, default: null, trim: true },
    swiftBic: { type: String, default: null, trim: true },
    routingNumber: { type: String, default: null, trim: true },
    accountNumber: { type: String, default: null, trim: true },
    otherDetails: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { _id: false }
);

// A bank account is only usable on an invoice once it identifies both who
// holds it and at least one real way to route a payment to it — an EU IBAN,
// a North American routing+account pair, or a free-text fallback for
// anything else.
export function isBankAccountComplete(account: IBankAccountDetails | null | undefined): boolean {
  if (!account) return false;
  if (!account.accountHolderName || !account.bankName || !account.country) return false;
  return !!(account.iban || (account.routingNumber && account.accountNumber) || account.otherDetails);
}
