import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export type ProjectStatus = 'active' | 'on_hold' | 'complete' | 'cancelled';

export interface ITaxRule {
  name: string;
  rate: number; // percentage, e.g. 21 for 21%
}

export interface IBudget {
  type: 'hours' | 'monetary' | null;
  amount: number | null;
}

export interface IProject extends Document {
  teamId: Types.ObjectId;
  clientId: Types.ObjectId;
  name: string;
  status: ProjectStatus;
  startDate: Date | null;
  endDate: Date | null;
  currency: string;
  hourlyRate: number | null;
  budget: IBudget;
  taxRules: ITaxRule[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const taxRuleSchema = new Schema<ITaxRule>(
  {
    name: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const budgetSchema = new Schema<IBudget>(
  {
    type: { type: String, enum: ['hours', 'monetary', null], default: null },
    amount: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

const projectSchema = new Schema<IProject>(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: ['active', 'on_hold', 'complete', 'cancelled'],
      default: 'active',
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
      uppercase: true,
      trim: true,
    },
    hourlyRate: {
      type: Number,
      default: null,
      min: 0,
    },
    budget: {
      type: budgetSchema,
      default: () => ({ type: null, amount: null }),
    },
    taxRules: {
      type: [taxRuleSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
projectSchema.index({ teamId: 1, status: 1 });
projectSchema.index({ teamId: 1, clientId: 1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const Project: Model<IProject> = mongoose.model<IProject>('Project', projectSchema);
