import mongoose, { Schema, type Document, type Model } from 'mongoose';
import argon2 from 'argon2';
import crypto from 'crypto';
import { addressSchema, type IAddress } from './shared/address.js';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------
export interface IRefreshToken {
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export type EmploymentType = 'employee' | 'contractor';

// A contractor's own incorporated business — printed as the "from" block on
// personal invoices they issue, and (via the creating manager) on collective
// invoices too. Only meaningful when employmentType is 'contractor'.
export interface IIncorporationDetails {
  companyName: string;
  address: IAddress;
  taxId: string;
}

export interface IUser extends Document {
  uid: string;
  email: string;
  emailVerified: boolean;
  passwordHash: string;
  firstName: string;
  lastName: string;
  locale: string;
  employmentType: EmploymentType;
  incorporation: IIncorporationDetails | null;
  refreshTokens: IRefreshToken[];
  emailVerificationToken: string | null;
  emailVerificationExpiry: Date | null;
  passwordResetToken: string | null;
  passwordResetExpiry: Date | null;
  deletionRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  verifyPassword(plainPassword: string): Promise<boolean>;
  toSafeObject(): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const incorporationSchema = new Schema<IIncorporationDetails>(
  {
    companyName: { type: String, required: true, trim: true },
    address: { type: addressSchema, required: true },
    taxId: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    // 24-char hex UID, generated independently of _id (UA-3)
    uid: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(12).toString('hex'),
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never return by default
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    locale: {
      type: String,
      default: 'en-US',
    },
    employmentType: {
      type: String,
      enum: ['employee', 'contractor'],
      default: 'employee',
    },
    incorporation: {
      type: incorporationSchema,
      default: null,
    },
    refreshTokens: {
      type: [refreshTokenSchema],
      select: false, // Never return by default
    },
    emailVerificationToken: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    deletionRequestedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Pre-save hook — hash password with Argon2 (TECH-16)
// ---------------------------------------------------------------------------
userSchema.pre('save', async function (next) {
  // Only hash if passwordHash was modified (i.e., it's a plaintext password being set)
  if (!this.isModified('passwordHash')) {
    return next();
  }

  try {
    this.passwordHash = await argon2.hash(this.passwordHash, {
      type: argon2.argon2id,
      memoryCost: 65536,    // 64 MiB
      timeCost: 3,
      parallelism: 4,
    });
    next();
  } catch (err) {
    next(err as Error);
  }
});

// ---------------------------------------------------------------------------
// Instance methods
// ---------------------------------------------------------------------------
userSchema.methods.verifyPassword = async function (plainPassword: string): Promise<boolean> {
  return argon2.verify(this.passwordHash, plainPassword);
};

/**
 * Returns a sanitized user object safe for API responses.
 * Strips passwordHash, refreshTokens, and token fields.
 */
userSchema.methods.toSafeObject = function (): Record<string, unknown> {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokens;
  delete obj.emailVerificationToken;
  delete obj.emailVerificationExpiry;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpiry;
  delete obj.__v;
  return obj;
};

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
