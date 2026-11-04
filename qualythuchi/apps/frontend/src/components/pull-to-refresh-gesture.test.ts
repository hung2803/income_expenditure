import { expect, it } from 'vitest';
import { measurePull, PULL_REFRESH_MAX, PULL_REFRESH_THRESHOLD } from './pull-to-refresh-gesture';

it('ignores touch jitter and cancels upward/horizontal swipes', () => {
  expect(measurePull(10, 20, 12, 26).direction).toBe('pending');
  expect(measurePull(10, 20, 10, 0).direction).toBe('cancel');
  expect(measurePull(10, 20, 90, 60).direction).toBe('cancel');
});

it('requires the release threshold and applies resistance and a maximum distance', () => {
  expect(measurePull(0, 0, 0, 80)).toMatchObject({ direction: 'pull', distance: 40, ready: false });
  expect(measurePull(0, 0, 0, PULL_REFRESH_THRESHOLD * 2)).toMatchObject({ distance: PULL_REFRESH_THRESHOLD, ready: true });
  expect(measurePull(0, 0, 0, 1000)).toMatchObject({ distance: PULL_REFRESH_MAX, ready: true });
});

it('disarms when the finger moves back under the release threshold', () => {
  expect(measurePull(0, 0, 0, 160).ready).toBe(true);
  expect(measurePull(0, 0, 0, 50).ready).toBe(false);
});
