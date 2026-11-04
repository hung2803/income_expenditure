import { ApiError } from '../api/http';
import { financeApi, type SyncChangeInput } from '../api/finance';
import { applyRemoteChanges, getSyncCursor, listOutbox, setOutboxItem } from './sync-storage';
import type { OutboxItem, RemoteSyncChange } from './sync-storage';

const activeOwners = new Set<string>();

export async function syncOutbox(ownerUserId: string, csrfToken: string): Promise<void> {
  if (!navigator.onLine || activeOwners.has(ownerUserId)) return;
  activeOwners.add(ownerUserId);
  let shouldPull = true;
  try {
    const items = await listOutbox(ownerUserId);
    for (const item of items) {
      if (item.status === 'synced') continue;
      try {
        await setOutboxItem(ownerUserId, { ...item, status: 'syncing', attempts: item.attempts + 1, updatedAt: Date.now(), error: undefined });
        notifySyncChange([item.entity === 'transfers' ? 'transfer' : 'transaction']);
        await send(item, csrfToken);
        await setOutboxItem(ownerUserId, { ...item, status: 'synced', attempts: item.attempts + 1, updatedAt: Date.now(), error: undefined });
        notifySyncChange([item.entity === 'transfers' ? 'transfer' : 'transaction']);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Không đồng bộ được dữ liệu.';
        await setOutboxItem(ownerUserId, { ...item, status: 'error', attempts: item.attempts + 1, updatedAt: Date.now(), error: message });
        notifySyncChange([item.entity === 'transfers' ? 'transfer' : 'transaction']);
        // Do not pull after a transport failure: the server may have committed
        // the request while its response was lost. Retry the same key first.
        shouldPull = error instanceof ApiError && error.serverCode === 'REVISION_CONFLICT';
        break;
      }
    }
    if (shouldPull && navigator.onLine) await pullChanges(ownerUserId);
  } finally { activeOwners.delete(ownerUserId); }
}

export async function pullChanges(ownerUserId: string): Promise<void> {
  let cursor = await getSyncCursor(ownerUserId);
  let hasMore = true;
  while (hasMore && navigator.onLine) {
    const page = await financeApi.pullSync(ownerUserId, cursor);
    const changes = (page.changes as RemoteSyncChange[]).map(normalizeRemoteChange);
    await applyRemoteChanges(ownerUserId, changes, page.cursor);
    cursor = page.cursor;
    hasMore = page.hasMore;
    if (changes.length) notifySyncChange(changes.map(change => change.entity));
  }
}

function normalizeRemoteChange(change: RemoteSyncChange): RemoteSyncChange {
  if (!change.payload || typeof change.payload !== 'object' || Array.isArray(change.payload)) return change;
  const payload = { ...(change.payload as Record<string, unknown>) };
  for (const key of ['occurredAt', 'createdAt', 'updatedAt', 'deletedAt']) {
    const value = payload[key];
    if (typeof value === 'number') payload[key] = new Date(value).toISOString();
  }
  return { ...change, payload };
}

async function send(item: OutboxItem, csrfToken: string): Promise<void> {
  let change: SyncChangeInput;
  if (item.entity === 'transfers') {
    if (item.operation !== 'create') throw new Error('Chỉ hỗ trợ tạo chuyển khoản trong hàng đợi.');
    const { id, sourceWalletId, destinationWalletId, amount, occurredAt } = item.payload;
    change = { entity: 'transfer', operation: 'upsert', id: item.recordId, data: { id, sourceWalletId, destinationWalletId, amount, occurredAt } };
  } else if (item.operation === 'delete') {
    change = { entity: 'transaction', operation: 'delete', id: item.recordId, revision: Number(item.payload.revision) };
  } else {
    const payload = item.payload;
    const revision = item.operation === 'create' ? 0 : Number(payload.revision ?? 0);
    const { type, amount, categoryId, walletId, occurredAt, note, tags } = payload;
    change = {
      entity: 'transaction', operation: 'upsert', id: item.recordId, revision,
      data: { id: item.recordId, type, amount, categoryId, walletId, occurredAt, note, tags }
    };
  }
  await financeApi.pushSync(item.ownerUserId, `outbox-${item.id}`, [change], csrfToken);
}

export function notifySyncChange(entities?: string[]) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('thu-chi-sync-change', { detail: { entities } }));
}
