import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LightingState } from '@shared/types';
const hooks = vi.hoisted(() => ({ effect: undefined as (() => void | (() => void)) | undefined, frames: [] as Record<number, number[]>[] }));
vi.mock('react', () => ({
  useEffect: (fn: () => void | (() => void)) => { hooks.effect = fn; },
  useRef: () => ({ current: 0 }),
  useState: () => [{}, (frame: Record<number, number[]>) => hooks.frames.push(frame)],
}));
import { useEffectPreview } from '../../src/renderer/src/effects';
import { S75PRO } from '@shared/models/s75pro';
let now = 0, next: FrameRequestCallback;
const listeners = new Map<string, (e: { code: string; repeat: boolean }) => void>();
beforeEach(() => {
  now = 0; hooks.frames = []; listeners.clear();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('window', { addEventListener: (type: string, fn: any) => listeners.set(type, fn), removeEventListener: (type: string) => listeners.delete(type) });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { next = fn; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const start = (mode: number, demo?: { enabled: boolean; request: number; onPlaying: (value: boolean) => void }) => {
  const state: LightingState = { mode, color: [255, 0, 200], brightness: 5, speed: 3, direction: 0, colorful: false };
  (useEffectPreview as any)(state, S75PRO.layout!, undefined, true, demo);
  return hooks.effect!();
};
const tick = (ms: number) => { now = ms; next(ms); return hooks.frames.at(-1)!; };

it.each([2, 3, 13, 14, 15])('reactive mode %s stays unchanged for 20 idle seconds without invented presses', (mode) => {
  const cleanup = start(mode);
  const initial = tick(40);
  for (let t = 80; t <= 20_000; t += 40) expect(tick(t)).toEqual(initial);
  if (mode === 2) expect(initial).toEqual({});
  cleanup?.();
  expect(listeners.has('keydown')).toBe(false);
});
it('labels a delayed one-shot demo, clears it at the end, and does not repeat', () => {
  vi.stubGlobal('document', { hidden: false, hasFocus: () => true });
  const onPlaying = vi.fn();
  const cleanup = start(2, { enabled: true, request: 0, onPlaying });
  expect(tick(4900)).toEqual({});
  expect(Object.keys(tick(5000)).length).toBeGreaterThan(0);
  expect(onPlaying).toHaveBeenLastCalledWith(true);
  expect(tick(9000)).toEqual({});
  expect(tick(20000)).toEqual({});
  expect(onPlaying).toHaveBeenLastCalledWith(false);
  cleanup?.();
});
it('real input immediately replaces synthetic demo keys', () => {
  vi.stubGlobal('document', { hidden: false, hasFocus: () => true });
  const cleanup = start(2, { enabled: true, request: 0, onPlaying: vi.fn() });
  tick(5000);
  listeners.get('keydown')!({ code: 'KeyA', repeat: false });
  expect(Object.keys(tick(5040))).toEqual(['4']);
  expect(tick(20000)).toEqual({});
  cleanup?.();
});
it('does not run a demo when live USB display disables it', () => {
  const cleanup = start(2, { enabled: false, request: 1, onPlaying: vi.fn() });
  expect(tick(6000)).toEqual({});
  expect(tick(20000)).toEqual({});
  cleanup?.();
});
it('does not count time spent outside the focused application', () => {
  let focused = true;
  vi.stubGlobal('document', { hidden: false, hasFocus: () => focused });
  const cleanup = start(2, { enabled: true, request: 0, onPlaying: vi.fn() });
  tick(2000); focused = false;
  listeners.get('blur')!({ code: '', repeat: false });
  expect(tick(60000)).toEqual({});
  focused = true;
  expect(tick(60040)).toEqual({});
  expect(Object.keys(tick(63040)).length).toBeGreaterThan(0);
  cleanup?.();
});
it('Single On lights only the actual key and fades back to idle', () => {
  const cleanup = start(2); tick(40);
  listeners.get('keydown')!({ code: 'KeyA', repeat: false });
  expect(Object.keys(tick(80))).toEqual(['4']);
  expect(tick(3000)).toEqual({});
  cleanup?.();
});
it('ignores repeat keydown events instead of restarting the light', () => {
  const cleanup = start(2); tick(40);
  listeners.get('keydown')!({ code: 'KeyA', repeat: true });
  expect(tick(80)).toEqual({});
  cleanup?.();
});
