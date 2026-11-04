export const LAST_USER_KEY = 'thu-chi:auth:last-user';
export const LOGOUT_PENDING_KEY = 'thu-chi:auth:logout-pending';
export const AUTH_CHANGE_KEY = 'thu-chi:auth:change';

// Every future account-specific persistent adapter must use this namespace.
// App-shell Workbox caches have a different name and survive logout.
export const userDataPrefix = (id: string) => `thu-chi:user:${encodeURIComponent(id)}:`;
export const userDatabaseName = (id: string) => `${userDataPrefix(id)}data`;

function removeKeys(storage: Storage, prefix: string) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) if (key?.startsWith(prefix)) storage.removeItem(key);
}

export async function clearUserData(id: string): Promise<void> {
  const prefix = userDataPrefix(id);
  removeKeys(localStorage, prefix);
  removeKeys(sessionStorage, prefix);
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(prefix)).map((name) => caches.delete(name)));
  }
  if ('indexedDB' in window) {
    const { clearCachedRecordsPreservingOutbox } = await import('../sync/sync-storage');
    const hasUnsent = await clearCachedRecordsPreservingOutbox(id);
    if (!hasUnsent) await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(userDatabaseName(id));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error('Cannot clear account database.'));
      request.onblocked = () => reject(new Error('Another tab still holds the account database.'));
    });
  }
}

export const browserAuthData = {
  lastUser: () => localStorage.getItem(LAST_USER_KEY),
  remember: (id: string) => localStorage.setItem(LAST_USER_KEY, id),
  forget: () => localStorage.removeItem(LAST_USER_KEY),
  pendingLogout: () => localStorage.getItem(LOGOUT_PENDING_KEY) === '1',
  setPendingLogout: (pending: boolean) => pending ? localStorage.setItem(LOGOUT_PENDING_KEY, '1') : localStorage.removeItem(LOGOUT_PENDING_KEY),
  clear: clearUserData,
  notify: () => localStorage.setItem(AUTH_CHANGE_KEY, `${Date.now()}:${Math.random()}`)
};
