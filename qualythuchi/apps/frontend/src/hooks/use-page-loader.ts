import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { registerPageLoader } from '@/infrastructure/refresh/page-refresh';

type Load = (controller: AbortController, refreshing: boolean) => Promise<unknown>;

// A stable scope (owner + server filters) avoids refetching on keystrokes or
// unrelated renders. A new scope cancels the old request before it can commit.
export function usePageLoader(load: Load, scope: string, refreshOnSync: boolean | readonly string[] = false) {
  const latest = useRef(load);
  const reload = useRef<() => Promise<void>>(() => Promise.resolve());
  useLayoutEffect(() => { latest.current = load; });
  useEffect(() => {
    let controller: AbortController;
    let pending: Promise<unknown> | undefined;
    const run = (refreshing: boolean, force = false) => {
      if (refreshing && pending && !force) return pending.then(() => undefined);
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      const request = Promise.resolve().then(() => latest.current(current, refreshing));
      pending = request;
      void request.finally(() => { if (pending === request) pending = undefined; }).catch(() => undefined);
      return request.then(() => undefined);
    };
    void run(false).catch(() => undefined); // Screens own their initial error/fallback UI.
    reload.current = () => run(true, true);
    const unregister = registerPageLoader(() => run(true));
    const changed = (event: Event) => {
      if (Array.isArray(refreshOnSync) && event instanceof CustomEvent && Array.isArray(event.detail?.entities)
        && !event.detail.entities.some((entity: string) => refreshOnSync.includes(entity))) return;
      if (navigator.onLine && document.visibilityState !== 'hidden') void run(true).catch(() => undefined);
    };
    if (refreshOnSync) {
      window.addEventListener('thu-chi-sync-change', changed);
      window.addEventListener('online', changed);
    }
    return () => {
      controller?.abort(); unregister();
      window.removeEventListener('thu-chi-sync-change', changed);
      window.removeEventListener('online', changed);
    };
  }, [scope, refreshOnSync]);
  return useCallback(() => reload.current(), []);
}
