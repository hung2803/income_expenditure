import { useEffect } from 'react';
import { useAuth } from '../../features/auth/auth-context';
import { syncOutbox } from './sync-engine';

export function SyncCoordinator() {
  const { session } = useAuth();
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let timer: number | undefined;
    const run = () => {
      if (stopped || !navigator.onLine || document.visibilityState === 'hidden') return;
      void syncOutbox(session.user.id, session.csrfToken).catch(() => undefined);
    };
    const scheduleRetry = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (!stopped && navigator.onLine && document.visibilityState !== 'hidden') {
        timer = window.setTimeout(() => { run(); scheduleRetry(); }, 30_000);
      }
    };
    const resume = () => { run(); scheduleRetry(); };
    run();
    scheduleRetry();
    window.addEventListener('online', resume);
    window.addEventListener('offline', scheduleRetry);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', scheduleRetry);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [session]);
  return null;
}
