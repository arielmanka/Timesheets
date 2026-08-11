import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// A user's per-rule-type override of the notification catalog's defaults
// (see notification.service.ts's RULE_CATALOG). No document here for a given
// (userId, ruleType) pair just means "use the catalog default" — so adding a
// new rule type later never requires backfilling every existing user.
// ---------------------------------------------------------------------------
export interface INotificationPreference extends Document {
  userId: Types.ObjectId;
  ruleType: string;
  enabled: boolean;
  emailEnabled: boolean;
  params: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ruleType: { type: String, required: true },
    enabled: { type: Boolean, required: true },
    emailEnabled: { type: Boolean, default: false },
    params: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  }
);

notificationPreferenceSchema.index({ userId: 1, ruleType: 1 }, { unique: true });

export const NotificationPreference: Model<INotificationPreference> = mongoose.model<INotificationPreference>(
  'NotificationPreference',
  notificationPreferenceSchema
);
