import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// A single in-app notification (the inbox row). Title/message are
// denormalized at write time — same reasoning as AuditLog — so the entry
// still reads clearly even if the entity it refers to is later renamed,
// reassigned, or deleted.
//
// `dedupeKey` plus the unique (userId, dedupeKey) index is what stops a rule
// re-evaluating every scan from spamming the same condition repeatedly —
// each rule handler chooses its own key shape (e.g. once-ever per entity,
// or once-per-week/day) so re-notification cadence is a per-rule decision.
// ---------------------------------------------------------------------------
export interface INotification extends Document {
  userId: Types.ObjectId;
  teamId: Types.ObjectId | null;
  ruleType: string;
  entityType: string;
  entityId: Types.ObjectId | null;
  title: string;
  message: string;
  read: boolean;
  dedupeKey: string;
  emailSent: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    ruleType: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    dedupeKey: { type: String, required: true },
    emailSent: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification: Model<INotification> = mongoose.model<INotification>('Notification', notificationSchema);
