export const PULL_REFRESH_THRESHOLD = 64;
export const PULL_REFRESH_MAX = 92;

export function measurePull(startX: number, startY: number, x: number, y: number) {
  const dx = x - startX;
  const dy = y - startY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return { direction: 'pending' as const, distance: 0, ready: false };
  if (dy <= 0 || Math.abs(dx) >= dy) return { direction: 'cancel' as const, distance: 0, ready: false };
  const distance = Math.min(PULL_REFRESH_MAX, dy * 0.5);
  return { direction: 'pull' as const, distance, ready: distance >= PULL_REFRESH_THRESHOLD };
}
