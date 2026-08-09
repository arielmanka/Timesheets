import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export type TimeRecordStatus = 'pending' | 'approved' | 'rejected';
export type RateSource = 'task' | 'project' | 'member';

export interface IChangeHistoryEntry {
  field: string;
  previousValue: unknown;
  newValue: unknown;
  changedBy: Types.ObjectId;
  changedAt: Date;
}

export interface ITimeRecord extends Document {
  userId: Types.ObjectId;
  projectId: Types.ObjectId;
  taskId: Types.ObjectId | null;
  date: Date;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  billable: boolean;
  note: string;
  resolvedRate: number;
  rateSource: RateSource;
  calculatedCost: number;
  currency: string;
  status: TimeRecordStatus;
  locked: boolean;
  invoiced: boolean;
  invoiceId: Types.ObjectId | null;
  approvedBy: Types.ObjectId | null;
  rejectedBy: Types.ObjectId | null;
  rejectionReason: string | null;
  changeHistory: IChangeHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const changeHistorySchema = new Schema<IChangeHistoryEntry>(
  {
    field: { type: String, required: true },
    previousValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const timeRecordSchema = new Schema<ITimeRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    billable: {
      type: Boolean,
      default: true,
    },
    note: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    resolvedRate: {
      type: Number,
      required: true,
      default: 0,
    },
    rateSource: {
      type: String,
      enum: ['task', 'project', 'member'],
      required: true,
    },
    calculatedCost: {
      type: Number,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    locked: {
      type: Boolean,
      default: false,
    },
    invoiced: {
      type: Boolean,
      default: false,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
      maxlength: 500,
    },
    changeHistory: {
      type: [changeHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
// Overlap detection: find records for the same user on the same date
timeRecordSchema.index({ userId: 1, date: 1 });

// Listing by project
timeRecordSchema.index({ projectId: 1, date: -1 });

// Invoice queries: find unbilled records for a project
timeRecordSchema.index({ projectId: 1, billable: 1, invoiced: 1 });

// ---------------------------------------------------------------------------
// Pre-save validation
// ---------------------------------------------------------------------------
timeRecordSchema.pre('save', function (next) {
  // Validate endTime > startTime (TR-7)
  if (this.endTime <= this.startTime) {
    const err = new Error('End time must be after start time');
    (err as Error & { statusCode: number; code: string }).statusCode = 400;
    (err as Error & { statusCode: number; code: string }).code = 'INVALID_TIME_RANGE';
    return next(err);
  }

  // Validate durationMinutes >= 1 (TR-7)
  if (this.durationMinutes < 1) {
    const err = new Error('Duration must be at least 1 minute');
    (err as Error & { statusCode: number; code: string }).statusCode = 400;
    (err as Error & { statusCode: number; code: string }).code = 'INVALID_DURATION';
    return next(err);
  }

  // Validate note length (TR-9)
  if (this.note && this.note.length > 1000) {
    const err = new Error('Note must not exceed 1000 characters');
    (err as Error & { statusCode: number; code: string }).statusCode = 400;
    (err as Error & { statusCode: number; code: string }).code = 'NOTE_TOO_LONG';
    return next(err);
  }

  next();
});

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const TimeRecord: Model<ITimeRecord> = mongoose.model<ITimeRecord>('TimeRecord', timeRecordSchema);
