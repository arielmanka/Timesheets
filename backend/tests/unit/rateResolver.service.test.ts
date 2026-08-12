import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockProjectFindById, mockTaskFindById, mockTeamFindById, mockMemberRateFindOne } = vi.hoisted(() => ({
  mockProjectFindById: vi.fn(),
  mockTaskFindById: vi.fn(),
  mockTeamFindById: vi.fn(),
  mockMemberRateFindOne: vi.fn(),
}));

vi.mock('../../src/models/Project.js', () => ({
  Project: { findById: mockProjectFindById },
}));

vi.mock('../../src/models/Task.js', () => ({
  Task: { findById: mockTaskFindById },
}));

vi.mock('../../src/models/Team.js', () => ({
  Team: { findById: mockTeamFindById },
}));

vi.mock('../../src/models/MemberRate.js', () => ({
  MemberRate: { findOne: mockMemberRateFindOne },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {},
}));

import { resolveRate } from '../../src/services/rateResolver.service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PROJECT = { _id: 'project-1', currency: 'USD', hourlyRate: 50 };
const TASK = { _id: 'task-1', hourlyRate: 75 };
const TEAM_WITH_MEMBER_RATE = {
  members: [{ userId: { toString: () => 'user-1' }, hourlyRate: 60 }],
};
const TEAM_WITHOUT_MEMBER_RATE = {
  members: [{ userId: { toString: () => 'user-1' }, hourlyRate: null }],
};

// ---------------------------------------------------------------------------
// Tests — precedence order (RB-5 / RB-11): member's task override >
// member's project override > member's flat team rate > task flat rate >
// project flat rate.
// ---------------------------------------------------------------------------
describe('rateResolver.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectFindById.mockResolvedValue(PROJECT);
    mockTaskFindById.mockResolvedValue(TASK);
    mockTeamFindById.mockResolvedValue(TEAM_WITH_MEMBER_RATE);
    mockMemberRateFindOne.mockResolvedValue(null);
  });

  it('returns 0/project when the project does not exist', async () => {
    mockProjectFindById.mockResolvedValue(null);
    const result = await resolveRate('missing', 'task-1', 'user-1', 'team-1');
    expect(result).toEqual({ rate: 0, source: 'project', currency: 'USD' });
  });

  it('falls back to the project flat rate when nothing more specific is set', async () => {
    mockTeamFindById.mockResolvedValue(TEAM_WITHOUT_MEMBER_RATE);
    mockTaskFindById.mockResolvedValue({ _id: 'task-1', hourlyRate: null });
    const result = await resolveRate('project-1', 'task-1', 'user-1', 'team-1');
    expect(result).toEqual({ rate: 50, source: 'project', currency: 'USD' });
  });

  it('prefers the task flat rate over the project flat rate', async () => {
    mockTeamFindById.mockResolvedValue(TEAM_WITHOUT_MEMBER_RATE);
    const result = await resolveRate('project-1', 'task-1', 'user-1', 'team-1');
    expect(result).toEqual({ rate: 75, source: 'task', currency: 'USD' });
  });

  it("prefers the member's flat team rate over the task and project flat rates", async () => {
    const result = await resolveRate('project-1', 'task-1', 'user-1', 'team-1');
    expect(result).toEqual({ rate: 60, source: 'member', currency: 'USD' });
  });

  it("prefers a project-level member override over the member's flat team rate", async () => {
    mockMemberRateFindOne.mockImplementation(async (filter: { taskId: string | null }) =>
      filter.taskId === null ? { hourlyRate: 90 } : null
    );
    const result = await resolveRate('project-1', 'task-1', 'user-1', 'team-1');
    expect(result).toEqual({ rate: 90, source: 'member', currency: 'USD' });
  });

  it('prefers a task-level member override over everything else', async () => {
    mockMemberRateFindOne.mockImplementation(async (filter: { taskId: string | null }) => {
      if (filter.taskId === 'task-1') return { hourlyRate: 120 };
      if (filter.taskId === null) return { hourlyRate: 90 };
      return null;
    });
    const result = await resolveRate('project-1', 'task-1', 'user-1', 'team-1');
    expect(result).toEqual({ rate: 120, source: 'member', currency: 'USD' });
  });

  it('skips the task-level override lookup and falls through to the project-level one when no task is given', async () => {
    mockTeamFindById.mockResolvedValue(TEAM_WITHOUT_MEMBER_RATE);
    mockMemberRateFindOne.mockImplementation(async (filter: { taskId: string | null }) =>
      filter.taskId === null ? { hourlyRate: 90 } : null
    );
    const result = await resolveRate('project-1', null, 'user-1', 'team-1');
    expect(result).toEqual({ rate: 90, source: 'member', currency: 'USD' });
  });
});
