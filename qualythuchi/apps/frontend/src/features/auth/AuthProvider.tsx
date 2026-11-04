import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createAuthApi } from '../../infrastructure/api/auth';
import { AUTH_CHANGE_KEY, LOGOUT_PENDING_KEY, browserAuthData } from '../../infrastructure/auth/user-data';
import { AuthContext } from './auth-context';
import { AuthStore } from './auth-store';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new AuthStore(createAuthApi(import.meta.env.VITE_API_BASE_URL ?? ''), browserAuthData));
  const { session } = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    void store.refresh();
    let resumeTimer: number | undefined;
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      if (resumeTimer !== undefined) window.clearTimeout(resumeTimer);
      // Safari may emit focus, pageshow and visibilitychange together. Coalesce
      // them into one auth check instead of aborting and replacing requests.
      resumeTimer = window.setTimeout(() => { resumeTimer = undefined; void store.refresh(); }, 150);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        if (resumeTimer !== undefined) window.clearTimeout(resumeTimer);
        resumeTimer = undefined;
        store.lock();
      } else recheck();
    };
    const changed = (event: StorageEvent) => {
      if (event.storageArea === localStorage && [AUTH_CHANGE_KEY, LOGOUT_PENDING_KEY, null].includes(event.key)) void store.synchronize();
    };
    window.addEventListener('storage', changed);
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', recheck);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      store.dispose();
      if (resumeTimer !== undefined) window.clearTimeout(resumeTimer);
      window.removeEventListener('storage', changed);
      window.removeEventListener('focus', recheck);
      window.removeEventListener('pageshow', recheck);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [store]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setTimeout(() => { void store.refresh(); }, Math.min(2_147_483_647, Math.max(0, Date.parse(session.expiresAt) - Date.now())));
    return () => window.clearTimeout(timer);
  }, [session, store]);

  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}
