import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------
export interface IAuditLog extends Document {
  eventType: string;
  entityType: string;
  entityId: Types.ObjectId;
  teamId: Types.ObjectId;
  actorId: Types.ObjectId;
  details: Record<string, unknown>;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const auditLogSchema = new Schema<IAuditLog>(
  {
    eventType: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    details: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  {
    // No updatedAt — audit logs are immutable
    timestamps: false,
  }
);

// Compound index for querying by team + time range
auditLogSchema.index({ teamId: 1, timestamp: -1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const AuditLog: Model<IAuditLog> = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
