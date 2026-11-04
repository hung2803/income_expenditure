import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';

const { pushSync, pullSync, outbox, setOutboxItem, getSyncCursor, applyRemoteChanges } = vi.hoisted(() => ({
  pushSync: vi.fn(), pullSync: vi.fn(), outbox: [] as Array<Record<string, unknown>>,
  setOutboxItem: vi.fn(), getSyncCursor: vi.fn(), applyRemoteChanges: vi.fn()
}));

vi.mock('../api/finance', () => ({ financeApi: { pushSync, pullSync } }));
vi.mock('./sync-storage', () => ({
  listOutbox: vi.fn(async () => outbox), setOutboxItem, getSyncCursor, applyRemoteChanges
}));

import { syncOutbox } from './sync-engine';

const owner = 'user-a';
const csrf = 'csrf-test';

function item(id: string, operation: string, recordId: string, payload: Record<string, unknown>) {
  return { id, ownerUserId: owner, entity: 'transactions', operation, recordId, payload, status: 'pending', attempts: 0, createdAt: outbox.length + 1, updatedAt: 0 };
}

describe('sync outbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outbox.splice(0);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    getSyncCursor.mockResolvedValue(0);
    pullSync.mockResolvedValue({ changes: [], cursor: 0, hasMore: false });
    pushSync.mockResolvedValue({ applied: [] });
  });

  it('replays a committed request with the same idempotency key after its response is lost', async () => {
    outbox.push(item('offline-create-1', 'create', 'tx-1', { id: 'tx-1', type: 'EXPENSE', amount: 300, walletId: 'w', categoryId: 'c', occurredAt: '2026-01-01T00:00:00.000Z' }));
    pushSync.mockRejectedValueOnce(new ApiError('NETWORK', 'network lost')).mockResolvedValueOnce({ applied: [{ id: 'tx-1' }] });

    await syncOutbox(owner, csrf);
    expect(pullSync).not.toHaveBeenCalled();
    await syncOutbox(owner, csrf);

    expect(pushSync).toHaveBeenCalledTimes(2);
    expect(pushSync.mock.calls.map((call) => call[1])).toEqual(['outbox-offline-create-1', 'outbox-offline-create-1']);
    expect(setOutboxItem.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'synced' });
    expect(pullSync).toHaveBeenCalledTimes(1);
  });

  it('pushes edits in outbox order and pulls remote changes after successful push', async () => {
    outbox.push(
      item('offline-create-2', 'create', 'tx-2', { id: 'tx-2', type: 'EXPENSE', amount: 100, walletId: 'w', categoryId: 'c', occurredAt: '2026-01-01T00:00:00.000Z' }),
      item('offline-edit-2', 'update', 'tx-2', { type: 'EXPENSE', amount: 200, walletId: 'w', categoryId: 'c', occurredAt: '2026-01-01T00:00:00.000Z', revision: 1 })
    );

    await syncOutbox(owner, csrf);

    expect(pushSync.mock.calls.map((call) => call[2][0].revision)).toEqual([0, 1]);
    expect(pushSync.mock.calls.map((call) => call[2][0].data.amount)).toEqual([100, 200]);
    expect(pullSync).toHaveBeenCalledWith(owner, 0);
  });

  it('keeps a stale local edit in error and pulls the server version for conflict review', async () => {
    outbox.push(item('stale-edit', 'update', 'tx-3', { type: 'EXPENSE', amount: 999, walletId: 'w', categoryId: 'c', occurredAt: '2026-01-01T00:00:00.000Z', revision: 1 }));
    pushSync.mockRejectedValue(new ApiError('HTTP', 'conflict', 409, 'REVISION_CONFLICT'));
    pullSync.mockResolvedValue({ changes: [{ cursor: 12, entity: 'transaction', recordId: 'tx-3', revision: 2, operation: 'UPSERT', payload: { amount: 250 }, changedAt: 1 }], cursor: 12, hasMore: false });

    await syncOutbox(owner, csrf);

    expect(setOutboxItem.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'error' });
    expect(applyRemoteChanges).toHaveBeenCalledWith(owner, expect.arrayContaining([expect.objectContaining({ recordId: 'tx-3', revision: 2 })]), 12);
  });
});
