import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export type TeamRole = 'member' | 'manager';

export interface ITeamMember {
  userId: Types.ObjectId;
  role: TeamRole;
  hourlyRate: number | null;
  joinedAt: Date;
}

export interface ITeam extends Document {
  name: string;
  creatorId: Types.ObjectId;
  members: ITeamMember[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const teamMemberSchema = new Schema<ITeamMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['member', 'manager'], default: 'member' },
    hourlyRate: { type: Number, default: null },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const teamSchema = new Schema<ITeam>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: {
      type: [teamMemberSchema],
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
// Quick lookup: "find all teams where user X is a member"
teamSchema.index({ 'members.userId': 1 });

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export const Team: Model<ITeam> = mongoose.model<ITeam>('Team', teamSchema);
