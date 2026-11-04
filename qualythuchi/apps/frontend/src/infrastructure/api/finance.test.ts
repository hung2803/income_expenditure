import { describe, expect, it, vi } from 'vitest';
import { createFinanceApi } from './finance';

describe('finance API client', () => {
  it('uses owner scoped routes and sends CSRF on transfer writes', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ transfer: { id: 't-1', type: 'TRANSFER' } }))
      .mockResolvedValueOnce(Response.json({ totalBalance: 500, incomeThisMonth: 0, expenseThisMonth: 0, recent: [] }));
    const api = createFinanceApi('', fetcher);

    await expect(api.createTransfer('user/a', {
      id: 't-1', sourceWalletId: 'wallet-a', destinationWalletId: 'wallet-b', amount: 200, occurredAt: '2026-10-23T00:00:00.000Z'
    }, 'csrf-memory')).resolves.toMatchObject({ id: 't-1', type: 'TRANSFER' });
    await expect(api.getSummary('user/a', undefined, 'Asia/Bangkok')).resolves.toMatchObject({ totalBalance: 500 });

    expect(fetcher.mock.calls[0][0]).toBe('/api/users/user%2Fa/transfers');
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: 'POST', credentials: 'include', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-memory' })
    });
    expect(fetcher.mock.calls[1][0]).toBe('/api/users/user%2Fa/summary?timezone=Asia%2FBangkok');
  });

  it('pushes an idempotent sync batch and pulls owner-scoped cursor changes', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ idempotencyKey: 'outbox-12345678', applied: [{ entity: 'transaction', operation: 'upsert', id: 'tx-1' }] }))
      .mockResolvedValueOnce(Response.json({ changes: [], cursor: 42, hasMore: false }));
    const api = createFinanceApi('', fetcher);
    await api.pushSync('user/a', 'outbox-12345678', [{ entity: 'transaction', operation: 'upsert', id: 'tx-1', revision: 0, data: { amount: 100 } }], 'csrf-memory');
    await expect(api.pullSync('user/a', 41)).resolves.toMatchObject({ cursor: 42, hasMore: false });

    expect(fetcher.mock.calls[0][0]).toBe('/api/users/user%2Fa/sync/push');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-memory' }) });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ idempotencyKey: 'outbox-12345678' });
    expect(fetcher.mock.calls[1][0]).toBe('/api/users/user%2Fa/sync/pull?cursor=41&limit=200');
  });

  it('requests owner-scoped reports and paginated advanced transaction filters', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ from: '2026-10-01', to: '2026-10-23', timezone: 'Asia/Bangkok', bucket: 'day', totals: { income: 0, expense: 0, net: 0, count: 0 }, series: [], categories: [], wallets: [] }))
      .mockResolvedValueOnce(Response.json({ transactions: [], total: 0, page: 2, limit: 25 }));
    const api = createFinanceApi('', fetcher);
    await api.getReport('user/a', { from: '2026-10-01', to: '2026-10-23', timezone: 'Asia/Bangkok', bucket: 'day' });
    await api.searchTransactions('user/a', { from: '2026-10-01', to: '2026-10-23', timezone: 'Asia/Bangkok', minAmount: 100_000, tag: 'food', page: 2, limit: 25 });
    expect(fetcher.mock.calls[0][0]).toContain('/api/users/user%2Fa/reports/summary?');
    expect(fetcher.mock.calls[0][0]).toContain('timezone=Asia%2FBangkok');
    expect(fetcher.mock.calls[1][0]).toContain('/api/users/user%2Fa/transactions/search?');
    expect(fetcher.mock.calls[1][0]).toContain('minAmount=100000');
    expect(fetcher.mock.calls[1][0]).toContain('page=2');
  });
});
