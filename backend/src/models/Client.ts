import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface IBillingAddress {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

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
const billingAddressSchema = new Schema<IBillingAddress>(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: null, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
  },
  { _id: false }
);

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
      type: billingAddressSchema,
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
