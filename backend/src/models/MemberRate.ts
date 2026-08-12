import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// A manager-set rate override for one team member, scoped to a project or,
// more specifically, to one task within that project (taskId: null means the
// override applies to the whole project). See rateResolver.service.ts for
// how this fits into the overall rate precedence (RB-5 / RB-11).
// ---------------------------------------------------------------------------
export interface IMemberRate extends Document {
  teamId: Types.ObjectId;
  projectId: Types.ObjectId;
  taskId: Types.ObjectId | null;
  userId: Types.ObjectId;
  hourlyRate: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const memberRateSchema = new Schema<IMemberRate>(
  {
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
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    hourlyRate: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
// A plain unique index on {userId, projectId, taskId} would reject a second
// taskId: null (project-level) row per user/project, since MongoDB treats
// multiple nulls as duplicates under a standard unique index — so task-level
// and project-level overrides each get their own partial unique index.
memberRateSchema.index(
  { userId: 1, projectId: 1, taskId: 1 },
  { unique: true, partialFilterExpression: { taskId: { $type: 'objectId' } } }
);
memberRateSchema.index(
  { userId: 1, projectId: 1 },
  { unique: true, partialFilterExpression: { taskId: null } }
);
memberRateSchema.index({ projectId: 1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const MemberRate: Model<IMemberRate> = mongoose.model<IMemberRate>('MemberRate', memberRateSchema);
