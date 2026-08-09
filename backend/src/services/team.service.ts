import { Team, type ITeam, type TeamRole } from '../models/Team.js';
import { User } from '../models/User.js';
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

  member.hourlyRate = hourlyRate;
  await team.save();

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
