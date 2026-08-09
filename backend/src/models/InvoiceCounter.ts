import mongoose, { Schema, type Model } from 'mongoose';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------
export interface IInvoiceCounter {
  _id: string;
  lastNumber: number;
}

// ---------------------------------------------------------------------------
// Schema — singleton per team (or global)
// ---------------------------------------------------------------------------
const invoiceCounterSchema = new Schema<IInvoiceCounter>({
  _id: { type: String, required: true },
  lastNumber: { type: Number, required: true, default: 0 },
});

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const InvoiceCounter: Model<IInvoiceCounter> = mongoose.model<IInvoiceCounter>(
  'InvoiceCounter',
  invoiceCounterSchema
);
