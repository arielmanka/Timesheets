import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export type InvoiceType = 'personal' | 'collective';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partially_paid' | 'overdue';

export interface ILineItem {
  description: string;
  hours: number;
  rate: number;
  // Gross amount for this line. For a rolled-up personal-invoice line on a
  // collective invoice, this is that personal invoice's own gross total
  // (net + its own tax) — each pooled invoice keeps the VAT rate its owner
  // charged, rather than the collective invoice applying one rate to all.
  amount: number;
  // Net (pre-tax) amount and the tax rate charged, set only on a collective
  // invoice's rolled-up personal-invoice line items; null for ordinary
  // time-record line items, which aren't individually taxed.
  netAmount: number | null;
  taxRate: number | null;
  timeRecordId: Types.ObjectId | null;
  // Set only on a collective invoice's line item that represents a rolled-up
  // personal invoice — lets removePersonalInvoiceFromPool find and drop the
  // right line item precisely, rather than matching on description text.
  personalInvoiceId: Types.ObjectId | null;
}

export interface IManualItem {
  description: string;
  amount: number;
}

export interface ITaxEntry {
  name: string;
  rate: number;
  amount: number;
}

export interface IInvoice extends Document {
  // Format: yyyymmdd-NNNNNN — creation date + a 6-digit, zero-padded,
  // never-resetting per-team sequence number (e.g. "20260810-000004").
  invoiceNumber: string;
  type: InvoiceType;
  teamId: Types.ObjectId;
  // Required for personal invoices (billed against one project); null for
  // collective invoices, which are scoped to a client and can span every
  // project that client has.
  projectId: Types.ObjectId | null;
  clientId: Types.ObjectId;
  createdBy: Types.ObjectId;
  status: InvoiceStatus;
  timeRecordIds: Types.ObjectId[];
  personalInvoiceIds: Types.ObjectId[];
  // Personal invoices only: the collective invoice currently pooling this
  // one, if any. This is the single source of truth for the derived
  // "in pool (draft/sent)" display state — never duplicated onto `status`.
  includedInCollectiveInvoiceId: Types.ObjectId | null;
  lineItems: ILineItem[];
  manualItems: IManualItem[];
  notes: string | null;
  subtotal: number;
  taxes: ITaxEntry[];
  totalTax: number;
  total: number;
  currency: string;
  partialPaymentAmount: number | null;
  paymentDate: Date | null;
  period: { startDate: Date; endDate: Date } | null;
  reconciled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const lineItemSchema = new Schema<ILineItem>(
  {
    description: { type: String, required: true },
    hours: { type: Number, required: true },
    rate: { type: Number, required: true },
    amount: { type: Number, required: true },
    netAmount: { type: Number, default: null },
    taxRate: { type: Number, default: null },
    timeRecordId: { type: Schema.Types.ObjectId, ref: 'TimeRecord', default: null },
    personalInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
  },
  { _id: false }
);

const manualItemSchema = new Schema<IManualItem>(
  {
    description: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const taxEntrySchema = new Schema<ITaxEntry>(
  {
    name: { type: String, required: true },
    rate: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const periodSchema = new Schema(
  {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { _id: false }
);

const invoiceSchema = new Schema<IInvoice>(
  {
    // Not globally unique — see the compound index below. Numbering is
    // per-team (InvoiceCounter is keyed by teamId), so uniqueness must be
    // scoped the same way or two teams' first invoices collide.
    invoiceNumber: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['personal', 'collective'],
      required: true,
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'partially_paid', 'overdue'],
      default: 'draft',
    },
    timeRecordIds: [{
      type: Schema.Types.ObjectId,
      ref: 'TimeRecord',
    }],
    personalInvoiceIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
    }],
    includedInCollectiveInvoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
    lineItems: [lineItemSchema],
    manualItems: [manualItemSchema],
    notes: {
      type: String,
      default: null,
      maxlength: 5000,
    },
    subtotal: {
      type: Number,
      required: true,
      default: 0,
    },
    taxes: [taxEntrySchema],
    totalTax: {
      type: Number,
      required: true,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
    },
    partialPaymentAmount: {
      type: Number,
      default: null,
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    period: {
      type: periodSchema,
      default: null,
    },
    reconciled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
invoiceSchema.index({ teamId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ teamId: 1, status: 1 });
invoiceSchema.index({ projectId: 1 });
invoiceSchema.index({ clientId: 1 });
invoiceSchema.index({ includedInCollectiveInvoiceId: 1 });
invoiceSchema.index({ createdBy: 1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const Invoice: Model<IInvoice> = mongoose.model<IInvoice>('Invoice', invoiceSchema);
