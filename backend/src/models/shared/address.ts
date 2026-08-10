import { Schema } from 'mongoose';

// ---------------------------------------------------------------------------
// Shared postal-address shape — used by Client.billingAddress and
// User.incorporation.address so both stay identical without duplicating the
// field list.
// ---------------------------------------------------------------------------
export interface IAddress {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export const addressSchema = new Schema<IAddress>(
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
