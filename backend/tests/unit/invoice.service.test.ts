import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockInvoiceFindOne } = vi.hoisted(() => ({
  mockInvoiceFindOne: vi.fn(),
}));

vi.mock('../../src/models/Invoice.js', () => ({
  Invoice: { findOne: mockInvoiceFindOne },
}));
vi.mock('../../src/models/InvoiceCounter.js', () => ({ InvoiceCounter: {} }));
vi.mock('../../src/models/TimeRecord.js', () => ({ TimeRecord: {} }));
vi.mock('../../src/models/Project.js', () => ({ Project: {} }));
vi.mock('../../src/models/Task.js', () => ({ Task: {} }));
vi.mock('../../src/models/Client.js', () => ({ Client: {} }));
vi.mock('../../src/models/User.js', () => ({ User: {} }));
vi.mock('../../src/models/shared/bankAccount.js', () => ({ isBankAccountComplete: vi.fn() }));
vi.mock('../../src/services/audit.service.js', () => ({ log: vi.fn() }));
vi.mock('../../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { recordPayment } from '../../src/services/invoice.service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function createMockInvoice(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'invoice-1',
    type: 'personal',
    status: 'sent',
    total: 1440,
    currency: 'CAD',
    partialPaymentAmount: null,
    paymentDate: null,
    payments: [] as Array<{ amount: number; date: Date; recordedBy: string }>,
    includedInCollectiveInvoiceId: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('invoice.service recordPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a partial payment, appends to history, keeps status partially_paid', async () => {
    const invoice = createMockInvoice();
    mockInvoiceFindOne.mockResolvedValue(invoice);

    const result = await recordPayment('invoice-1', 'team-1', 740, new Date('2026-08-13'), 'user-1');

    expect(result.status).toBe('partially_paid');
    expect(result.partialPaymentAmount).toBe(740);
    expect(result.payments).toHaveLength(1);
    expect(result.payments[0]).toMatchObject({ amount: 740, recordedBy: 'user-1' });
    expect(invoice.save).toHaveBeenCalled();
  });

  it('accumulates a second payment and flips to paid once the total is reached exactly', async () => {
    const invoice = createMockInvoice({
      partialPaymentAmount: 740,
      payments: [{ amount: 740, date: new Date('2026-08-13'), recordedBy: 'user-1' }],
      status: 'partially_paid',
    });
    mockInvoiceFindOne.mockResolvedValue(invoice);

    const result = await recordPayment('invoice-1', 'team-1', 700, new Date('2026-08-15'), 'user-1');

    expect(result.status).toBe('paid');
    expect(result.partialPaymentAmount).toBe(1440);
    expect(result.payments).toHaveLength(2);
    expect(result.payments[1]).toMatchObject({ amount: 700, recordedBy: 'user-1' });
  });

  it('flips to paid despite floating-point drift in the stored total (cent-rounded comparison)', async () => {
    const invoice = createMockInvoice({ total: 1440.0000000001, partialPaymentAmount: 740, status: 'partially_paid' });
    mockInvoiceFindOne.mockResolvedValue(invoice);

    const result = await recordPayment('invoice-1', 'team-1', 700, new Date('2026-08-15'), 'user-1');

    expect(result.status).toBe('paid');
  });

  it('rejects a payment that would exceed the invoice total, without mutating the invoice', async () => {
    const invoice = createMockInvoice({ partialPaymentAmount: 740, status: 'partially_paid' });
    mockInvoiceFindOne.mockResolvedValue(invoice);

    await expect(recordPayment('invoice-1', 'team-1', 701, new Date('2026-08-15'), 'user-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'PAYMENT_EXCEEDS_TOTAL',
    });
    expect(invoice.save).not.toHaveBeenCalled();
    expect(invoice.payments).toHaveLength(0);
  });

  it('rejects recording a payment on a personal invoice already pooled into a collective invoice', async () => {
    const invoice = createMockInvoice({ type: 'personal', includedInCollectiveInvoiceId: 'collective-1' });
    mockInvoiceFindOne.mockResolvedValue(invoice);

    await expect(recordPayment('invoice-1', 'team-1', 100, new Date('2026-08-15'), 'user-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVOICE_POOLED',
    });
    expect(invoice.save).not.toHaveBeenCalled();
  });

  it('allows recording a payment on a collective invoice regardless of includedInCollectiveInvoiceId (only personal invoices can be pooled)', async () => {
    const invoice = createMockInvoice({ type: 'collective', includedInCollectiveInvoiceId: null });
    mockInvoiceFindOne.mockResolvedValue(invoice);

    const result = await recordPayment('invoice-1', 'team-1', 100, new Date('2026-08-15'), 'user-1');
    expect(result.status).toBe('partially_paid');
  });

  it('rejects recording a payment on a draft or already-paid invoice', async () => {
    mockInvoiceFindOne.mockResolvedValue(createMockInvoice({ status: 'draft' }));
    await expect(recordPayment('invoice-1', 'team-1', 100, new Date(), 'user-1')).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_STATUS' });

    mockInvoiceFindOne.mockResolvedValue(createMockInvoice({ status: 'paid' }));
    await expect(recordPayment('invoice-1', 'team-1', 100, new Date(), 'user-1')).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_STATUS' });
  });
});
