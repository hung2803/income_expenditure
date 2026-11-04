import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowDown, LoaderCircle } from 'lucide-react';
import { measurePull, PULL_REFRESH_THRESHOLD } from './pull-to-refresh-gesture';
import { refreshPageData } from '@/infrastructure/refresh/page-refresh';

const ignoredTarget = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-no-pull-refresh], dialog, [role="dialog"]';
type PullState = { distance: number; phase: 'idle' | 'pulling' | 'ready' | 'refreshing' | 'done' | 'error'; message?: string };
const idle: PullState = { distance: 0, phase: 'idle' };

function canStartPull(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target.closest(ignoredTarget)) return false;
  if (document.activeElement?.matches(ignoredTarget)) return false;
  if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return false;
  for (let element: Element | null = target; element && element !== document.body && element !== document.documentElement; element = element.parentElement) {
    const style = getComputedStyle(element);
    if ((/(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1)
      || (/(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1)) return false;
  }
  return window.scrollY <= 0 && (document.scrollingElement?.scrollTop ?? 0) <= 0;
}

export function PullToRefresh() {
  const { key } = useLocation();
  const [state, setState] = useState<PullState>(idle);

  useEffect(() => {
    let gesture: { id: number; x: number; y: number; distance: number; pulling: boolean } | null = null;
    let refreshing = false;
    let feedbackTimer: number | undefined;
    let mounted = true;
    const root = document.documentElement;
    const previous = root.getAttribute('data-pull-refresh');
    root.setAttribute('data-pull-refresh', 'enabled');
    setState(idle);

    const cancel = () => {
      gesture = null;
      if (!refreshing) setState(idle);
    };
    const start = (event: TouchEvent) => {
      if (refreshing) return;
      cancel();
      if (event.touches.length !== 1 || !canStartPull(event.target)) return;
      if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
      const touch = event.touches[0];
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, distance: 0, pulling: false };
    };
    const move = (event: TouchEvent) => {
      if (!gesture || refreshing) return;
      if (event.touches.length !== 1 || window.scrollY > 0 || (document.scrollingElement?.scrollTop ?? 0) > 0) { cancel(); return; }
      const touch = event.touches[0];
      if (touch.identifier !== gesture.id) { cancel(); return; }
      const pull = measurePull(gesture.x, gesture.y, touch.clientX, touch.clientY);
      if (pull.direction === 'cancel') { cancel(); return; }
      if (pull.direction === 'pending' && !gesture.pulling) return;
      if (!event.cancelable) { cancel(); return; }
      // Claim only an intentional vertical pull at the top. Normal scrolling,
      // horizontal swipes and pinch zoom keep their native behavior.
      event.preventDefault();
      gesture.pulling = true;
      gesture.distance = pull.distance;
      setState({ distance: pull.distance, phase: pull.ready ? 'ready' : 'pulling' });
    };
    const end = (event: TouchEvent) => {
      if (!gesture || refreshing) return;
      const completed = gesture;
      gesture = null;
      if (event.touches.length || !Array.from(event.changedTouches).some((touch) => touch.identifier === completed.id)
        || !completed.pulling || completed.distance < PULL_REFRESH_THRESHOLD) { cancel(); return; }
      refreshing = true;
      setState({ distance: PULL_REFRESH_THRESHOLD, phase: 'refreshing' });
      // Refresh mounted data loaders. No navigation, remount or lost drafts.
      void refreshPageData().then(() => {
        if (mounted) setState({ distance: PULL_REFRESH_THRESHOLD, phase: 'done', message: 'Đã làm mới dữ liệu' });
      }).catch((error: unknown) => {
        if (mounted) setState({ distance: PULL_REFRESH_THRESHOLD, phase: 'error', message: error instanceof Error ? error.message : 'Không tải được dữ liệu mới. Hãy thử lại.' });
      }).finally(() => {
        refreshing = false;
        if (mounted) feedbackTimer = window.setTimeout(() => setState(idle), 3500);
      });
    };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted = false;
      if (feedbackTimer !== undefined) window.clearTimeout(feedbackTimer);
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
      document.removeEventListener('visibilitychange', visibility);
      if (previous === null) root.removeAttribute('data-pull-refresh');
      else root.setAttribute('data-pull-refresh', previous);
    };
  }, [key]);

  const active = state.phase !== 'idle';
  const label = state.message ?? (state.phase === 'refreshing' ? 'Đang làm mới…' : state.phase === 'ready' ? 'Thả để làm mới' : 'Kéo để làm mới');
  return <div className={`pull-refresh-indicator pull-refresh-${state.phase}`} role="status" aria-live="polite" aria-atomic="true" aria-hidden={!active}
    style={{ opacity: active ? Math.min(1, state.distance / 24) : 0, transform: `translate(-50%, ${state.distance - PULL_REFRESH_THRESHOLD}px)` }}>
    {state.phase === 'refreshing' ? <LoaderCircle aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
    <span>{active ? label : ''}</span>
  </div>;
}
