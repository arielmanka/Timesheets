import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export type TaskStatus = 'open' | 'in_progress' | 'done';

export interface ITask extends Document {
  projectId: Types.ObjectId;
  name: string;
  description: string | null;
  status: TaskStatus;
  assignedTo: Types.ObjectId | null;
  hourlyRate: number | null;
  // Task selection on a time record is mandatory (see TimeRecord), and a
  // record's own billable flag is copied from its task at creation time —
  // this is the single place a manager controls what's billable, rather
  // than each team member deciding per entry.
  billable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const taskSchema = new Schema<ITask>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'done'],
      default: 'open',
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    hourlyRate: {
      type: Number,
      default: null,
      min: 0,
    },
    billable: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for listing tasks by project + status
taskSchema.index({ projectId: 1, status: 1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const Task: Model<ITask> = mongoose.model<ITask>('Task', taskSchema);
