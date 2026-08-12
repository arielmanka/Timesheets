import { Team, type ITeam, type TeamRole } from '../models/Team.js';
import { User } from '../models/User.js';
import { MemberRate } from '../models/MemberRate.js';
import * as auditService from './audit.service.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Create team — creator becomes manager (UA-4)
// ---------------------------------------------------------------------------
export async function createTeam(userId: string, name: string): Promise<ITeam> {
  const team = new Team({
    name,
    creatorId: userId,
    members: [
      {
        userId,
        role: 'manager' as TeamRole,
        hourlyRate: null,
        joinedAt: new Date(),
      },
    ],
  });

  await team.save();

  logger.info({ teamId: team._id, userId }, 'Team created');
  return team;
}

// ---------------------------------------------------------------------------
// Get teams for a user (UA-5)
// ---------------------------------------------------------------------------
export async function getTeamsForUser(userId: string): Promise<ITeam[]> {
  return Team.find({ 'members.userId': userId }).sort({ createdAt: -1 });
}

// ---------------------------------------------------------------------------
// Get a single team by ID
// ---------------------------------------------------------------------------
export async function getTeamById(teamId: string): Promise<ITeam> {
  const team = await Team.findById(teamId);
  if (!team) {
    throw AppError.notFound('Team not found');
  }
  return team;
}

// ---------------------------------------------------------------------------
// Get a single team by ID, with member identities resolved for display.
// Read-only — uses a separate populated query so the authorization-critical
// `Team.findById` path (accessControl middleware, mutation services below,
// which compare `member.userId.toString()`) is never touched by populate.
// ---------------------------------------------------------------------------
export interface TeamMemberProfile {
  userId: string;
  role: TeamRole;
  hourlyRate: number | null;
  joinedAt: Date;
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
}

export async function getTeamWithMembers(
  teamId: string,
  requestingUserId: string
): Promise<{
  _id: string;
  name: string;
  creatorId: string;
  members: TeamMemberProfile[];
  createdAt: Date;
  updatedAt: Date;
}> {
  const team = await Team.findById(teamId).populate<{
    members: Array<{
      userId: { _id: string; uid: string; firstName: string; lastName: string; email: string };
      role: TeamRole;
      hourlyRate: number | null;
      joinedAt: Date;
    }>;
  }>('members.userId', 'uid firstName lastName email');

  if (!team) {
    throw AppError.notFound('Team not found');
  }

  // RB-8: hourly rates must never be exposed to a regular (non-manager) viewer.
  const requesterIsManager = team.members.some(
    (m) => m.userId?._id?.toString() === requestingUserId && m.role === 'manager'
  );

  return {
    _id: team._id.toString(),
    name: team.name,
    creatorId: team.creatorId.toString(),
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    members: team.members
      // A member whose user document was deleted would populate to null — skip defensively.
      .filter((m) => m.userId && typeof m.userId === 'object')
      .map((m) => ({
        userId: m.userId._id.toString(),
        role: m.role,
        hourlyRate: requesterIsManager ? m.hourlyRate : null,
        joinedAt: m.joinedAt,
        uid: m.userId.uid,
        firstName: m.userId.firstName,
        lastName: m.userId.lastName,
        email: m.userId.email,
      })),
  };
}

// ---------------------------------------------------------------------------
// Search user by UID — exact match (UA-6)
// ---------------------------------------------------------------------------
export async function searchUserByUid(uid: string): Promise<{ _id: string; uid: string; firstName: string; lastName: string; email: string } | null> {
  if (!uid || uid.length !== 24 || !/^[a-f0-9]+$/.test(uid)) {
    return null;
  }

  const user = await User.findOne({ uid });
  if (!user) {
    return null;
  }

  return {
    _id: user._id.toString(),
    uid: user.uid,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
}

// ---------------------------------------------------------------------------
// Add member by UID (UA-7) — only managers can add
// ---------------------------------------------------------------------------
export async function addMember(
  teamId: string,
  targetUid: string,
  actorId: string
): Promise<ITeam> {
  const team = await getTeamById(teamId);
  assertManager(team, actorId);

  // Find target user by UID
  const targetUser = await User.findOne({ uid: targetUid });
  if (!targetUser) {
    throw AppError.notFound('User not found with that UID');
  }

  const targetUserId = targetUser._id.toString();

  // Check if already a member
  const alreadyMember = team.members.some(
    (m) => m.userId.toString() === targetUserId
  );
  if (alreadyMember) {
    throw AppError.conflict('User is already a member of this team', 'ALREADY_MEMBER');
  }

  team.members.push({
    userId: targetUser._id,
    role: 'member',
    hourlyRate: null,
    joinedAt: new Date(),
  });

  await team.save();

  logger.info({ teamId, targetUserId, actorId }, 'Member added to team');
  return team;
}

// ---------------------------------------------------------------------------
// Remove member (UA-9) — managers only, cannot remove self if sole manager
// ---------------------------------------------------------------------------
export async function removeMember(
  teamId: string,
  targetUserId: string,
  actorId: string
): Promise<ITeam> {
  const team = await getTeamById(teamId);
  assertManager(team, actorId);

  const memberIndex = team.members.findIndex(
    (m) => m.userId.toString() === targetUserId
  );
  if (memberIndex === -1) {
    throw AppError.notFound('User is not a member of this team');
  }

  // Prevent removing self if sole manager
  if (targetUserId === actorId) {
    const managerCount = team.members.filter((m) => m.role === 'manager').length;
    if (managerCount <= 1) {
      throw AppError.badRequest(
        'Cannot remove yourself — you are the only manager. Assign another manager first.',
        'SOLE_MANAGER'
      );
    }
  }

  team.members.splice(memberIndex, 1);
  await team.save();

  // A removed member's rate overrides (RB-11) would otherwise linger as
  // orphaned rows nothing else ever cleans up — harmless (resolvedRate is
  // snapshotted per RB-6) but pointless to keep around.
  await MemberRate.deleteMany({ teamId, userId: targetUserId });

  logger.info({ teamId, targetUserId, actorId }, 'Member removed from team');
  return team;
}

// ---------------------------------------------------------------------------
// Set member role (UA-8, UA-9) — managers only
// ---------------------------------------------------------------------------
export async function setRole(
  teamId: string,
  targetUserId: string,
  role: TeamRole,
  actorId: string
): Promise<ITeam> {
  const team = await getTeamById(teamId);
  assertManager(team, actorId);

  const member = team.members.find(
    (m) => m.userId.toString() === targetUserId
  );
  if (!member) {
    throw AppError.notFound('User is not a member of this team');
  }

  // Prevent demoting self if sole manager
  if (targetUserId === actorId && role === 'member') {
    const managerCount = team.members.filter((m) => m.role === 'manager').length;
    if (managerCount <= 1) {
      throw AppError.badRequest(
        'Cannot demote yourself — you are the only manager. Assign another manager first.',
        'SOLE_MANAGER'
      );
    }
  }

  member.role = role;
  await team.save();

  logger.info({ teamId, targetUserId, role, actorId }, 'Member role updated');
  return team;
}

// ---------------------------------------------------------------------------
// Set member hourly rate (RB-1) — managers only
// ---------------------------------------------------------------------------
export async function setMemberRate(
  teamId: string,
  targetUserId: string,
  hourlyRate: number | null,
  actorId: string
): Promise<ITeam> {
  const team = await getTeamById(teamId);
  assertManager(team, actorId);

  const member = team.members.find(
    (m) => m.userId.toString() === targetUserId
  );
  if (!member) {
    throw AppError.notFound('User is not a member of this team');
  }

  const previousRate = member.hourlyRate;
  member.hourlyRate = hourlyRate;
  await team.save();

  if (previousRate !== hourlyRate) {
    const targetUser = await User.findById(targetUserId);
    await auditService.log('member_rate_changed', 'TeamMember', targetUserId, teamId, actorId, {
      targetUserId,
      targetUserName: targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : 'Unknown user',
      previousRate,
      newRate: hourlyRate,
    });
  }

  logger.info({ teamId, targetUserId, hourlyRate, actorId }, 'Member rate updated');
  return team;
}

// ---------------------------------------------------------------------------
// Delete team (UA-9) — managers only
// ---------------------------------------------------------------------------
export async function deleteTeam(teamId: string, actorId: string): Promise<void> {
  const team = await getTeamById(teamId);
  assertManager(team, actorId);

  await Team.deleteOne({ _id: teamId });

  logger.info({ teamId, actorId }, 'Team deleted');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a user is a member of a team and return their role.
 */
export function getMemberRole(team: ITeam, userId: string): TeamRole | null {
  const member = team.members.find((m) => m.userId.toString() === userId);
  return member?.role ?? null;
}

/**
 * Assert the actor is a manager of the team. Throws 403 if not.
 */
function assertManager(team: ITeam, actorId: string): void {
  const role = getMemberRole(team, actorId);
  if (role !== 'manager') {
    throw AppError.forbidden('Only team managers can perform this action');
  }
}

/**
 * All manager userIds for a team — e.g. to resolve who should receive a
 * manager-scoped notification about something happening on that team.
 */
export async function getTeamManagerIds(teamId: string): Promise<string[]> {
  const team = await Team.findById(teamId);
  if (!team) return [];
  return team.members.filter((m) => m.role === 'manager').map((m) => m.userId.toString());
}

/**
 * Whether a user manages at least one team — used to decide whether
 * manager-scoped notification rules should even appear in their settings.
 */
export async function isManagerOfAnyTeam(userId: string): Promise<boolean> {
  const count = await Team.countDocuments({ members: { $elemMatch: { userId, role: 'manager' } } });
  return count > 0;
}
