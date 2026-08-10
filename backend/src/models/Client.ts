import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { addressSchema, type IAddress } from './shared/address.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export type IBillingAddress = IAddress;

export interface IClient extends Document {
  teamId: Types.ObjectId;
  name: string;
  billingContact: string;
  billingEmail: string;
  billingAddress: IBillingAddress;
  taxId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const clientSchema = new Schema<IClient>(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    billingContact: {
      type: String,
      required: true,
      trim: true,
    },
    billingEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    billingAddress: {
      type: addressSchema,
      required: true,
    },
    taxId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for listing clients per team
clientSchema.index({ teamId: 1, name: 1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const Client: Model<IClient> = mongoose.model<IClient>('Client', clientSchema);
