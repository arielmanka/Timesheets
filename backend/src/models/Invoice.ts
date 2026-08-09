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
  amount: number;
  timeRecordId: Types.ObjectId | null;
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
  invoiceNumber: number;
  type: InvoiceType;
  teamId: Types.ObjectId;
  projectId: Types.ObjectId;
  clientId: Types.ObjectId;
  createdBy: Types.ObjectId;
  status: InvoiceStatus;
  timeRecordIds: Types.ObjectId[];
  personalInvoiceIds: Types.ObjectId[];
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
    timeRecordId: { type: Schema.Types.ObjectId, ref: 'TimeRecord', default: null },
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
    invoiceNumber: {
      type: Number,
      required: true,
      unique: true,
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
      required: true,
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
invoiceSchema.index({ teamId: 1, status: 1 });
invoiceSchema.index({ projectId: 1 });
invoiceSchema.index({ createdBy: 1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const Invoice: Model<IInvoice> = mongoose.model<IInvoice>('Invoice', invoiceSchema);
