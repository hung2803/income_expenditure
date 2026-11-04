import { userDatabaseName } from '../auth/user-data';

export type SyncItemStatus = 'pending' | 'syncing' | 'synced' | 'error';
export type SyncEntity = 'transactions' | 'transfers';
export type LocalEntity = SyncEntity | 'wallets' | 'categories' | 'budgets' | 'savings_goals' | 'savings_contributions' | 'recurring_schedules';
export type SyncOperation = 'create' | 'update' | 'delete' | 'undo';

export interface OutboxItem {
  id: string;
  ownerUserId: string;
  entity: SyncEntity;
  operation: SyncOperation;
  recordId: string;
  payload: Record<string, unknown>;
  status: SyncItemStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface LocalRecord<T = unknown> {
  key: string;
  ownerUserId: string;
  entity: LocalEntity;
  id: string;
  value: T;
  updatedAt: number;
  deleted?: boolean;
}

export interface SyncSnapshot {
  pending: number;
  syncing: number;
  error: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export interface RemoteSyncChange {
  cursor: number;
  entity: 'wallet' | 'category' | 'transaction' | 'transfer' | 'budget' | 'savings_goal' | 'savings_contribution' | 'recurring_schedule';
  recordId: string;
  revision: number;
  operation: 'UPSERT' | 'DELETE';
  payload: unknown;
  changedAt: number;
}

const recordStore = 'records';
const outboxStore = 'outbox';
const cursorStore = 'sync-state';

function openDatabase(ownerUserId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(userDatabaseName(ownerUserId), 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(recordStore)) database.createObjectStore(recordStore, { keyPath: 'key' });
      if (!database.objectStoreNames.contains(outboxStore)) {
        const store = database.createObjectStore(outboxStore, { keyPath: 'id' });
        store.createIndex('ownerUserId', 'ownerUserId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
      if (!database.objectStoreNames.contains(cursorStore)) database.createObjectStore(cursorStore, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const database = request.result;
      // Another tab may be clearing this account during logout. Release our
      // adapter connections instead of blocking its delete/upgrade request.
      database.onversionchange = () => database.close();
      if (blocked) database.close();
      else resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('Không mở được IndexedDB.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('IndexedDB đang được sử dụng ở tab khác.'));
    };
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Giao dịch IndexedDB thất bại.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Giao dịch IndexedDB bị hủy.'));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Không đọc được IndexedDB.'));
  });
}

export async function enqueueLocalMutation<T>(input: {
  ownerUserId: string;
  entity: SyncEntity;
  operation: SyncOperation;
  recordId: string;
  payload: Record<string, unknown>;
  value: T;
  deleted?: boolean;
}, now = Date.now()): Promise<OutboxItem> {
  const database = await openDatabase(input.ownerUserId);
  try {
    const transaction = database.transaction([recordStore, outboxStore], 'readwrite');
    const done = transactionDone(transaction);
    const existing = await requestValue(transaction.objectStore(outboxStore).index('ownerUserId').getAll(input.ownerUserId)) as OutboxItem[];
    const createdAt = Math.max(now, (existing.reduce((latest, item) => Math.max(latest, item.createdAt), 0) + 1));
    const outbox: OutboxItem = {
      id: crypto.randomUUID(), ownerUserId: input.ownerUserId, entity: input.entity,
      operation: input.operation, recordId: input.recordId, payload: input.payload,
      status: 'pending', attempts: 0, createdAt, updatedAt: createdAt
    };
    transaction.objectStore(recordStore).put({
      key: `${input.entity}:${input.recordId}`, ownerUserId: input.ownerUserId,
      entity: input.entity, id: input.recordId, value: input.value, updatedAt: createdAt,
      ...(input.deleted ? { deleted: true } : {})
    } satisfies LocalRecord<T>);
    transaction.objectStore(outboxStore).add(outbox);
    await done;
    return outbox;
  } finally { database.close(); }
}

export async function listOutbox(ownerUserId: string): Promise<OutboxItem[]> {
  const database = await openDatabase(ownerUserId);
  try {
    const transaction = database.transaction(outboxStore, 'readonly');
    const done = transactionDone(transaction);
    const items = await requestValue(transaction.objectStore(outboxStore).index('ownerUserId').getAll(ownerUserId)) as OutboxItem[];
    await done;
    return items.sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
  } finally { database.close(); }
}

export async function getSyncCursor(ownerUserId: string): Promise<number> {
  const database = await openDatabase(ownerUserId);
  try {
    const transaction = database.transaction(cursorStore, 'readonly');
    const done = transactionDone(transaction);
    const state = await requestValue(transaction.objectStore(cursorStore).get('cursor')) as { value?: number } | undefined;
    await done;
    return state?.value ?? 0;
  } finally { database.close(); }
}

export async function applyRemoteChanges(ownerUserId: string, changes: RemoteSyncChange[], cursor: number): Promise<void> {
  const database = await openDatabase(ownerUserId);
  try {
    const transaction = database.transaction([recordStore, outboxStore, cursorStore], 'readwrite');
    const done = transactionDone(transaction);
    const records = transaction.objectStore(recordStore);
    const outboxStoreRef = transaction.objectStore(outboxStore);
    const cursorObjectStore = transaction.objectStore(cursorStore);
    const pendingRequest = outboxStoreRef.index('ownerUserId').getAll(ownerUserId);
    pendingRequest.onsuccess = () => {
      const pending = (pendingRequest.result as OutboxItem[]).filter((item) => item.status !== 'synced');
      for (const change of changes) {
        const entity = ({ wallet: 'wallets', category: 'categories', transaction: 'transactions', transfer: 'transfers', budget: 'budgets', savings_goal: 'savings_goals', savings_contribution: 'savings_contributions', recurring_schedule: 'recurring_schedules' } as const)[change.entity];
        const localOutbox = pending.filter((item) => item.entity === entity && item.recordId === change.recordId);
        if (localOutbox.length) {
          for (const item of localOutbox) {
            outboxStoreRef.put({ ...item, status: 'error', updatedAt: Date.now(), error: 'Bản ghi đã được thay đổi trên máy chủ. Giữ nguyên bản trên thiết bị để bạn xử lý xung đột.' } satisfies OutboxItem);
          }
          continue;
        }
        const key = `${entity}:${change.recordId}`;
        records.put({ key, ownerUserId, entity, id: change.recordId, value: change.payload, updatedAt: change.changedAt, ...(change.operation === 'DELETE' ? { deleted: true } : {}) } satisfies LocalRecord);
      }
      cursorObjectStore.put({ key: 'cursor', value: cursor });
    };
    await done;
  } finally { database.close(); }
}

export async function setOutboxItem(ownerUserId: string, item: OutboxItem): Promise<void> {
  const database = await openDatabase(ownerUserId);
  try {
    const transaction = database.transaction(outboxStore, 'readwrite');
    transaction.objectStore(outboxStore).put(item);
    await transactionDone(transaction);
  } finally { database.close(); }
}

export async function putLocalRecord<T>(record: LocalRecord<T>): Promise<void> {
  const database = await openDatabase(record.ownerUserId);
  try {
    const transaction = database.transaction(recordStore, 'readwrite');
    transaction.objectStore(recordStore).put(record);
    await transactionDone(transaction);
  } finally { database.close(); }
}

// Reconcile a complete API list in one transaction. Never replace unsent edits
// with an older server value, or resurrect a local pending deletion.
export async function cacheRemoteList<T extends { id: string }>(ownerUserId: string, entity: LocalEntity, items: T[], signal?: AbortSignal): Promise<T[]> {
  const database = await openDatabase(ownerUserId);
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const transaction = database.transaction([recordStore, outboxStore], 'readwrite');
    const done = transactionDone(transaction);
    const records = transaction.objectStore(recordStore);
    const [local, outbox] = await Promise.all([
      requestValue(records.getAll()) as Promise<Array<LocalRecord<T>>>,
      requestValue(transaction.objectStore(outboxStore).index('ownerUserId').getAll(ownerUserId)) as Promise<OutboxItem[]>
    ]);
    if (signal?.aborted) { transaction.abort(); await done; }
    const pending = new Set(outbox.filter(item => item.entity === entity && item.status !== 'synced').map(item => item.recordId));
    const merged = new Map(items.map(item => [item.id, item]));
    for (const record of local) {
      if (record.ownerUserId !== ownerUserId || record.entity !== entity) continue;
      if (pending.has(record.id)) {
        if (record.deleted) merged.delete(record.id);
        else merged.set(record.id, record.value);
      } else if (!merged.has(record.id)) records.delete(record.key);
    }
    for (const item of items) if (!pending.has(item.id)) {
      records.put({ key: `${entity}:${item.id}`, ownerUserId, entity, id: item.id, value: item, updatedAt: Date.now() } satisfies LocalRecord<T>);
    }
    await done;
    return [...merged.values()];
  } finally { database.close(); }
}

export async function listLocalRecords<T>(ownerUserId: string, entity: LocalEntity): Promise<Array<LocalRecord<T>>> {
  const database = await openDatabase(ownerUserId);
  try {
    const transaction = database.transaction(recordStore, 'readonly');
    const records = await requestValue(transaction.objectStore(recordStore).getAll()) as Array<LocalRecord<T>>;
    await transactionDone(transaction);
    return records.filter((record) => record.ownerUserId === ownerUserId && record.entity === entity);
  } finally { database.close(); }
}

export async function getSyncSnapshot(ownerUserId: string): Promise<SyncSnapshot> {
  const items = await listOutbox(ownerUserId);
  const errors = items.filter((item) => item.status === 'error');
  return {
    pending: items.filter((item) => item.status === 'pending').length,
    syncing: items.filter((item) => item.status === 'syncing').length,
    error: errors.length,
    lastSyncedAt: items.filter((item) => item.status === 'synced').reduce<number | null>((latest, item) => Math.max(latest ?? 0, item.updatedAt), null),
    lastError: errors.at(-1)?.error ?? null
  };
}

export async function clearCachedRecordsPreservingOutbox(ownerUserId: string): Promise<boolean> {
  const database = await openDatabase(ownerUserId);
  try {
    const transaction = database.transaction([recordStore, outboxStore], 'readwrite');
    const done = transactionDone(transaction);
    const items = await requestValue(transaction.objectStore(outboxStore).index('ownerUserId').getAll(ownerUserId)) as OutboxItem[];
    const hasUnsent = items.some((item) => item.status !== 'synced');
    transaction.objectStore(recordStore).clear();
    if (!hasUnsent) transaction.objectStore(outboxStore).clear();
    await done;
    return hasUnsent;
  } finally { database.close(); }
}
