import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockTeamSave,
  mockTeamFindById,
  mockTeamFind,
  mockTeamDeleteOne,
  mockTeamConstructor,
  mockUserFindOne,
} = vi.hoisted(() => ({
  mockTeamSave: vi.fn().mockResolvedValue(undefined),
  mockTeamFindById: vi.fn(),
  mockTeamFind: vi.fn(),
  mockTeamDeleteOne: vi.fn(),
  mockTeamConstructor: vi.fn(),
  mockUserFindOne: vi.fn(),
}));

vi.mock('../../src/models/Team.js', () => {
  const TeamModel = function (this: Record<string, unknown>, data: Record<string, unknown>) {
    mockTeamConstructor(data);
    Object.assign(this, data);
    this.save = mockTeamSave;
    this._id = data._id ?? 'team-1';
    this.members = data.members ?? [];
    return this;
  };

  TeamModel.findById = mockTeamFindById;
  TeamModel.find = mockTeamFind;
  TeamModel.deleteOne = mockTeamDeleteOne;

  return { Team: TeamModel };
});

vi.mock('../../src/models/User.js', () => ({
  User: {
    findOne: mockUserFindOne,
  },
}));

vi.mock('../../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {},
}));

import * as teamService from '../../src/services/team.service.js';
import { AppError } from '../../src/utils/errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockTeam(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'team-1',
    name: 'Test Team',
    creatorId: 'user-1',
    members: [
      { userId: { toString: () => 'user-1' }, role: 'manager', hourlyRate: null, joinedAt: new Date() },
    ],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('team.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // createTeam
  // -------------------------------------------------------------------------
  describe('createTeam', () => {
    it('creates a team with the creator as manager', async () => {
      const team = await teamService.createTeam('user-1', 'My Team');

      expect(mockTeamConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Team',
          creatorId: 'user-1',
          members: expect.arrayContaining([
            expect.objectContaining({ userId: 'user-1', role: 'manager' }),
          ]),
        })
      );
      expect(mockTeamSave).toHaveBeenCalled();
      expect(team).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getTeamsForUser
  // -------------------------------------------------------------------------
  describe('getTeamsForUser', () => {
    it('queries teams where user is a member', async () => {
      const mockTeams = [createMockTeam()];
      mockTeamFind.mockReturnValueOnce({ sort: vi.fn().mockResolvedValueOnce(mockTeams) });

      const result = await teamService.getTeamsForUser('user-1');

      expect(mockTeamFind).toHaveBeenCalledWith({ 'members.userId': 'user-1' });
      expect(result).toEqual(mockTeams);
    });
  });

  // -------------------------------------------------------------------------
  // getTeamById
  // -------------------------------------------------------------------------
  describe('getTeamById', () => {
    it('returns the team when found', async () => {
      const mockTeam = createMockTeam();
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      const result = await teamService.getTeamById('team-1');
      expect(result).toEqual(mockTeam);
    });

    it('throws not found when team does not exist', async () => {
      mockTeamFindById.mockResolvedValueOnce(null);

      await expect(teamService.getTeamById('nonexistent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // -------------------------------------------------------------------------
  // searchUserByUid
  // -------------------------------------------------------------------------
  describe('searchUserByUid', () => {
    it('returns user info for valid UID match', async () => {
      mockUserFindOne.mockResolvedValueOnce({
        _id: { toString: () => 'user-2' },
        uid: 'abcdef1234567890abcdef12',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });

      const result = await teamService.searchUserByUid('abcdef1234567890abcdef12');

      expect(result).toEqual({
        _id: 'user-2',
        uid: 'abcdef1234567890abcdef12',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      });
    });

    it('returns null for invalid UID format (wrong length)', async () => {
      const result = await teamService.searchUserByUid('short');
      expect(result).toBeNull();
      expect(mockUserFindOne).not.toHaveBeenCalled();
    });

    it('returns null for invalid UID format (non-hex)', async () => {
      const result = await teamService.searchUserByUid('zzzzzzzzzzzzzzzzzzzzzzzz');
      expect(result).toBeNull();
    });

    it('returns null when no user matches', async () => {
      mockUserFindOne.mockResolvedValueOnce(null);

      const result = await teamService.searchUserByUid('abcdef1234567890abcdef12');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // addMember
  // -------------------------------------------------------------------------
  describe('addMember', () => {
    it('adds a user to the team by UID', async () => {
      const mockTeam = createMockTeam();
      mockTeamFindById.mockResolvedValueOnce(mockTeam);
      mockUserFindOne.mockResolvedValueOnce({
        _id: 'user-2',
        uid: 'abcdef1234567890abcdef12',
      });

      const result = await teamService.addMember('team-1', 'abcdef1234567890abcdef12', 'user-1');

      expect(mockTeam.members).toHaveLength(2);
      expect(mockTeam.save).toHaveBeenCalled();
      expect(result).toBe(mockTeam);
    });

    it('throws 403 when non-manager tries to add', async () => {
      const mockTeam = createMockTeam({
        members: [
          { userId: { toString: () => 'user-1' }, role: 'member', hourlyRate: null, joinedAt: new Date() },
        ],
      });
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      await expect(
        teamService.addMember('team-1', 'some-uid', 'user-1')
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws 404 when target user not found', async () => {
      const mockTeam = createMockTeam();
      mockTeamFindById.mockResolvedValueOnce(mockTeam);
      mockUserFindOne.mockResolvedValueOnce(null);

      await expect(
        teamService.addMember('team-1', 'abcdef1234567890abcdef12', 'user-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 409 when user is already a member', async () => {
      const mockTeam = createMockTeam({
        members: [
          { userId: { toString: () => 'user-1' }, role: 'manager', hourlyRate: null, joinedAt: new Date() },
          { userId: { toString: () => 'user-2' }, role: 'member', hourlyRate: null, joinedAt: new Date() },
        ],
      });
      mockTeamFindById.mockResolvedValueOnce(mockTeam);
      mockUserFindOne.mockResolvedValueOnce({ _id: { toString: () => 'user-2' } });

      await expect(
        teamService.addMember('team-1', 'some-uid', 'user-1')
      ).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_MEMBER' });
    });
  });

  // -------------------------------------------------------------------------
  // removeMember
  // -------------------------------------------------------------------------
  describe('removeMember', () => {
    it('removes a member from the team', async () => {
      const mockTeam = createMockTeam({
        members: [
          { userId: { toString: () => 'user-1' }, role: 'manager', hourlyRate: null, joinedAt: new Date() },
          { userId: { toString: () => 'user-2' }, role: 'member', hourlyRate: null, joinedAt: new Date() },
        ],
      });
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      await teamService.removeMember('team-1', 'user-2', 'user-1');

      expect(mockTeam.members).toHaveLength(1);
      expect(mockTeam.save).toHaveBeenCalled();
    });

    it('throws 404 when target user is not a member', async () => {
      const mockTeam = createMockTeam();
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      await expect(
        teamService.removeMember('team-1', 'user-99', 'user-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('prevents sole manager from removing self', async () => {
      const mockTeam = createMockTeam(); // user-1 is only manager
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      await expect(
        teamService.removeMember('team-1', 'user-1', 'user-1')
      ).rejects.toMatchObject({ statusCode: 400, code: 'SOLE_MANAGER' });
    });
  });

  // -------------------------------------------------------------------------
  // setRole
  // -------------------------------------------------------------------------
  describe('setRole', () => {
    it('updates a member role', async () => {
      const mockTeam = createMockTeam({
        members: [
          { userId: { toString: () => 'user-1' }, role: 'manager', hourlyRate: null, joinedAt: new Date() },
          { userId: { toString: () => 'user-2' }, role: 'member', hourlyRate: null, joinedAt: new Date() },
        ],
      });
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      await teamService.setRole('team-1', 'user-2', 'manager', 'user-1');

      expect(mockTeam.members[1].role).toBe('manager');
      expect(mockTeam.save).toHaveBeenCalled();
    });

    it('prevents sole manager from demoting self', async () => {
      const mockTeam = createMockTeam();
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      await expect(
        teamService.setRole('team-1', 'user-1', 'member', 'user-1')
      ).rejects.toMatchObject({ statusCode: 400, code: 'SOLE_MANAGER' });
    });
  });

  // -------------------------------------------------------------------------
  // setMemberRate
  // -------------------------------------------------------------------------
  describe('setMemberRate', () => {
    it('updates a member hourly rate', async () => {
      const mockTeam = createMockTeam({
        members: [
          { userId: { toString: () => 'user-1' }, role: 'manager', hourlyRate: null, joinedAt: new Date() },
          { userId: { toString: () => 'user-2' }, role: 'member', hourlyRate: null, joinedAt: new Date() },
        ],
      });
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      await teamService.setMemberRate('team-1', 'user-2', 75.5, 'user-1');

      expect(mockTeam.members[1].hourlyRate).toBe(75.5);
      expect(mockTeam.save).toHaveBeenCalled();
    });

    it('allows setting rate to null', async () => {
      const mockTeam = createMockTeam({
        members: [
          { userId: { toString: () => 'user-1' }, role: 'manager', hourlyRate: null, joinedAt: new Date() },
          { userId: { toString: () => 'user-2' }, role: 'member', hourlyRate: 50, joinedAt: new Date() },
        ],
      });
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      await teamService.setMemberRate('team-1', 'user-2', null, 'user-1');

      expect(mockTeam.members[1].hourlyRate).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // deleteTeam
  // -------------------------------------------------------------------------
  describe('deleteTeam', () => {
    it('deletes the team when actor is manager', async () => {
      const mockTeam = createMockTeam();
      mockTeamFindById.mockResolvedValueOnce(mockTeam);
      mockTeamDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });

      await teamService.deleteTeam('team-1', 'user-1');

      expect(mockTeamDeleteOne).toHaveBeenCalledWith({ _id: 'team-1' });
    });

    it('throws 403 when non-manager tries to delete', async () => {
      const mockTeam = createMockTeam({
        members: [
          { userId: { toString: () => 'user-1' }, role: 'member', hourlyRate: null, joinedAt: new Date() },
        ],
      });
      mockTeamFindById.mockResolvedValueOnce(mockTeam);

      await expect(
        teamService.deleteTeam('team-1', 'user-1')
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // -------------------------------------------------------------------------
  // getMemberRole
  // -------------------------------------------------------------------------
  describe('getMemberRole', () => {
    it('returns the role of a member', () => {
      const team = createMockTeam() as any;
      expect(teamService.getMemberRole(team, 'user-1')).toBe('manager');
    });

    it('returns null for non-member', () => {
      const team = createMockTeam() as any;
      expect(teamService.getMemberRole(team, 'user-99')).toBeNull();
    });
  });
});
