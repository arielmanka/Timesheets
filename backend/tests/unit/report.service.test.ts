import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockTimeRecordFind, mockProjectFind, mockTaskFind, mockClientFind, mockUserFind, mockInvoiceFind } = vi.hoisted(() => ({
  mockTimeRecordFind: vi.fn(),
  mockProjectFind: vi.fn(),
  mockTaskFind: vi.fn(),
  mockClientFind: vi.fn(),
  mockUserFind: vi.fn(),
  mockInvoiceFind: vi.fn(),
}));

vi.mock('../../src/models/TimeRecord.js', () => ({
  TimeRecord: { find: mockTimeRecordFind },
}));
vi.mock('../../src/models/Project.js', () => ({
  Project: { find: mockProjectFind },
}));
vi.mock('../../src/models/Task.js', () => ({
  Task: { find: mockTaskFind },
}));
vi.mock('../../src/models/Client.js', () => ({
  Client: { find: mockClientFind },
}));
vi.mock('../../src/models/User.js', () => ({
  User: { find: mockUserFind },
}));
vi.mock('../../src/models/Invoice.js', () => ({
  Invoice: { find: mockInvoiceFind },
}));

import { getTrend, getInvoiceTrend } from '../../src/services/report.service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PROJECT_A = { _id: 'project-a', name: 'Project A', clientId: 'client-1' };
const PROJECT_B = { _id: 'project-b', name: 'Project B', clientId: 'client-2' };

function record(overrides: Record<string, unknown>) {
  return {
    userId: 'user-1',
    projectId: 'project-a',
    taskId: null,
    date: new Date('2026-08-10T00:00:00.000Z'),
    durationMinutes: 60,
    calculatedCost: 50,
    currency: 'USD',
    ...overrides,
  };
}

function setup(records: ReturnType<typeof record>[], projects = [PROJECT_A]) {
  mockProjectFind.mockResolvedValue(projects);
  mockTimeRecordFind.mockReturnValue({ sort: vi.fn().mockResolvedValue(records) });
  mockTaskFind.mockResolvedValue([]);
  mockClientFind.mockResolvedValue([
    { _id: 'client-1', name: 'Client One' },
    { _id: 'client-2', name: 'Client Two' },
  ]);
  mockUserFind.mockResolvedValue([{ _id: 'user-1', firstName: 'Ariel', lastName: 'M' }]);
}

describe('report.service getTrend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to the last 30 days (daily granularity) when no dates are given', async () => {
    setup([]);
    const result = await getTrend({ teamId: 'team-1' }, 'project', true, 'user-1');
    expect(result.granularity).toBe('day');
    expect(result.buckets).toHaveLength(30);

    const todayKey = new Date().toISOString().slice(0, 10);
    expect(result.buckets[result.buckets.length - 1]).toBe(todayKey);
  });

  it('uses weekly granularity for a range over 62 days', async () => {
    setup([]);
    const result = await getTrend(
      { teamId: 'team-1', startDate: new Date('2026-06-01'), endDate: new Date('2026-08-15') },
      'project',
      true,
      'user-1'
    );
    expect(result.granularity).toBe('week');
  });

  it('uses monthly granularity for a range over 182 days', async () => {
    setup([]);
    const result = await getTrend(
      { teamId: 'team-1', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
      'project',
      true,
      'user-1'
    );
    expect(result.granularity).toBe('month');
  });

  it('zero-fills every bucket, not just buckets with matching records', async () => {
    setup([record({ date: new Date('2026-08-05T00:00:00.000Z'), durationMinutes: 120, calculatedCost: 100 })]);
    const result = await getTrend(
      { teamId: 'team-1', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-10') },
      'project',
      true,
      'user-1'
    );
    expect(result.buckets).toHaveLength(10);
    const series = result.series[0]!;
    expect(series.hours).toHaveLength(10);
    const dayIndex = result.buckets.indexOf('2026-08-05');
    expect(series.hours[dayIndex]).toBe(2);
    expect(series.hours.filter((h) => h === 0)).toHaveLength(9);
  });

  it('groups by client, combining hours from multiple projects under the same client', async () => {
    setup(
      [
        record({ projectId: 'project-a', date: new Date('2026-08-02T00:00:00.000Z'), durationMinutes: 60 }),
        record({ projectId: 'project-b', date: new Date('2026-08-02T00:00:00.000Z'), durationMinutes: 120 }),
      ],
      [PROJECT_A, { ...PROJECT_B, clientId: 'client-1' }]
    );
    const result = await getTrend(
      { teamId: 'team-1', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-05') },
      'client',
      true,
      'user-1'
    );
    expect(result.series).toHaveLength(1);
    expect(result.series[0]!.name).toBe('Client One');
    const dayIndex = result.buckets.indexOf('2026-08-02');
    expect(result.series[0]!.hours[dayIndex]).toBe(3);
  });

  it('groups records with no task under "No task"', async () => {
    setup([record({ taskId: null, date: new Date('2026-08-02T00:00:00.000Z') })]);
    const result = await getTrend(
      { teamId: 'team-1', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-05') },
      'task',
      true,
      'user-1'
    );
    expect(result.series).toHaveLength(1);
    expect(result.series[0]!.name).toBe('No task');
  });

  it('caps at 7 series and folds the rest into "Other", per currency', async () => {
    const projects = Array.from({ length: 9 }, (_, i) => ({ _id: `project-${i}`, name: `Project ${i}`, clientId: 'client-1' }));
    // Descending hours: project-0 has 9h, project-8 has 1h.
    const records = projects.map((p, i) =>
      record({ projectId: p._id, durationMinutes: (9 - i) * 60, date: new Date('2026-08-02T00:00:00.000Z') })
    );
    setup(records, projects);
    const result = await getTrend(
      { teamId: 'team-1', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-05') },
      'project',
      true,
      'user-1'
    );
    const realSeries = result.series.filter((s) => s.id !== '__other__');
    const otherSeries = result.series.find((s) => s.id === '__other__');
    expect(realSeries).toHaveLength(7);
    expect(realSeries.map((s) => s.name)).toEqual([
      'Project 0',
      'Project 1',
      'Project 2',
      'Project 3',
      'Project 4',
      'Project 5',
      'Project 6',
    ]);
    expect(otherSeries).toBeDefined();
    const dayIndex = result.buckets.indexOf('2026-08-02');
    // project-7 (2h) + project-8 (1h) folded into Other.
    expect(otherSeries!.hours[dayIndex]).toBe(3);
  });

  it('does not create an "Other" series when there are 7 or fewer entities', async () => {
    setup([record({ projectId: 'project-a' })], [PROJECT_A]);
    const result = await getTrend(
      { teamId: 'team-1', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-05') },
      'project',
      true,
      'user-1'
    );
    expect(result.series.find((s) => s.id === '__other__')).toBeUndefined();
  });
});

describe('report.service getInvoiceTrend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClientFind.mockResolvedValue([
      { _id: 'client-1', name: 'Client One' },
      { _id: 'client-2', name: 'Client Two' },
    ]);
  });

  function invoice(overrides: Record<string, unknown>) {
    return {
      status: 'sent',
      clientId: 'client-1',
      currency: 'USD',
      total: 100,
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      ...overrides,
    };
  }

  it('groups by status, excluding draft invoices from the amount (but not the count)', async () => {
    mockInvoiceFind.mockResolvedValue([
      invoice({ status: 'sent', total: 100 }),
      invoice({ status: 'paid', total: 200 }),
      invoice({ status: 'draft', total: 300 }),
    ]);
    const result = await getInvoiceTrend(
      { teamId: 'team-1', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-05') },
      'status',
      true,
      'user-1'
    );
    const dayIdx = result.buckets.indexOf('2026-08-02');
    const sent = result.series.find((s) => s.id === 'sent')!;
    const paid = result.series.find((s) => s.id === 'paid')!;
    const draft = result.series.find((s) => s.id === 'draft')!;
    expect(sent.name).toBe('Sent');
    expect(sent.amount[dayIdx]).toBe(100);
    expect(paid.amount[dayIdx]).toBe(200);
    expect(draft.count[dayIdx]).toBe(1);
    expect(draft.amount[dayIdx]).toBe(0);
  });

  it('groups by client, ranked by count (currency-agnostic), capped at 7 plus Other', async () => {
    const invoices = Array.from({ length: 9 }, (_, i) =>
      Array.from({ length: 9 - i }, () => invoice({ clientId: `client-${i}`, total: 10 }))
    ).flat();
    mockClientFind.mockResolvedValue(Array.from({ length: 9 }, (_, i) => ({ _id: `client-${i}`, name: `Client ${i}` })));
    mockInvoiceFind.mockResolvedValue(invoices);
    const result = await getInvoiceTrend(
      { teamId: 'team-1', startDate: new Date('2026-08-01'), endDate: new Date('2026-08-05') },
      'client',
      true,
      'user-1'
    );
    const realNames = new Set(result.series.filter((s) => s.id !== '__other__').map((s) => s.name));
    expect(realNames.size).toBe(7);
    expect(realNames.has('Client 0')).toBe(true);
    expect(realNames.has('Client 7')).toBe(false);
    expect(result.series.find((s) => s.id === '__other__')).toBeDefined();
  });

  it('defaults to the last 30 days when no dates are given', async () => {
    mockInvoiceFind.mockResolvedValue([]);
    const result = await getInvoiceTrend({ teamId: 'team-1' }, 'status', true, 'user-1');
    expect(result.granularity).toBe('day');
    expect(result.buckets).toHaveLength(30);
  });
});
