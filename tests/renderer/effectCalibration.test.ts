import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { KeyDef, LightingState } from '@shared/types';
const hooks = vi.hoisted(() => ({ effect: undefined as (() => void | (() => void)) | undefined, frames: [] as Record<number, [number, number, number]>[] }));
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => { hooks.effect = effect; },
  useRef: () => ({ current: 0 }),
  useState: () => [{}, (colors: Record<number, [number, number, number]>) => hooks.frames.push(colors)],
}));
import { keyColor, useEffectPreview } from '../../src/renderer/src/effects';
import { S75PRO } from '@shared/models/s75pro';
const bounds = { minX: 0, minY: 0, w: 100, h: 100 };
const calibrated = { scanLength: 80 };
const key = (x: number, y: number, code = 4): KeyDef => ({ ...S75PRO.layout![0], x, y, w: 10, h: 10, code });
const light = (mode: number, patch: Partial<LightingState> = {}): LightingState => ({ mode, color: [120, 180, 240], colorful: false, brightness: 5, speed: 5, direction: 0, ...patch });
const intensity = (c: [number, number, number] | null) => c ? c[0] + c[1] + c[2] : 0;
beforeEach(() => {
  hooks.frames = []; hooks.effect = undefined;
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('Scrolling dims a horizontal band without changing color across a row', () => {
  const l = light(10);
  const a = keyColor(l, key(20, 20), bounds, 0.25, 0, calibrated);
  expect(a).toEqual(keyColor(l, key(70, 20), bounds, 0.25, 1, calibrated));
  expect(intensity(a)).toBeLessThan(intensity(keyColor(l, key(20, 70), bounds, 0.25, 2, calibrated)));
});
it('Scrolling dark band advances from top to bottom at default direction', () => {
  const l = light(10), top = key(20, 20), bottom = key(20, 70);
  expect(intensity(keyColor(l, top, bounds, 0.25, 0, calibrated))).toBeLessThan(intensity(keyColor(l, top, bounds, 0.75, 0, calibrated)));
  expect(intensity(keyColor(l, bottom, bounds, 0.75, 0, calibrated))).toBeLessThan(intensity(keyColor(l, bottom, bounds, 0.25, 0, calibrated)));
});
it('Rolling dims a vertical band that advances left to right, not diagonally', () => {
  const l = light(11), a = keyColor(l, key(20, 20), bounds, 0.25, 0, calibrated);
  expect(a).toEqual(keyColor(l, key(20, 70), bounds, 0.25, 1, calibrated));
  expect(intensity(a)).toBeLessThan(intensity(keyColor(l, key(70, 20), bounds, 0.25, 2, calibrated)));
});
it('Flowing lights only a small consecutive tail and honors the selected single color', () => {
  const l = light(16), calibration = { scanLength: 8 };
  const colors = Array.from({ length: 8 }, (_, i) => keyColor(l, key(20, 20), bounds, 0.3, i, calibration));
  expect(colors.flatMap((c, i) => c ? [i] : [])).toEqual([1, 2, 3]);
  expect(colors[3]).toEqual(l.color);
  for (const c of colors) if (c) { expect(c[1]).toBe(c[0] * 1.5); expect(c[2]).toBe(c[0] * 2); }
});
it('Flowing visits each key in sequence and restarts after the last key', () => {
  const l = light(16), calibration = { scanLength: 8 };
  const colorsAt = (t: number) => Array.from({ length: 8 }, (_, i) => keyColor(l, key(20, 20), bounds, t, i, calibration));
  for (let i = 0; i < 8; i++) {
    const intensities = colorsAt((i + 0.1) / 10).map(intensity);
    expect(intensities.indexOf(Math.max(...intensities))).toBe(i);
  }
  expect(colorsAt(1)).toEqual(colorsAt(0));
});
it('Flowing retains brightness scaling instead of replacing single-color mode with rainbow', () => {
  expect(keyColor(light(16, { brightness: 3 }), key(20, 20), bounds, 0.3, 3, { scanLength: 8 })).toEqual([72, 108, 144]);
});
it('keeps legacy simulations unchanged when S75 calibration is not selected', () => {
  expect(keyColor(light(16), key(20, 20), bounds, 0.25, 0)).toEqual([255, 153, 0]);
  expect(keyColor(light(1), key(20, 20), bounds, 0.25, 0)).toEqual([120, 180, 240]);
});
it('preserves the legacy Pulsating result without Mac S75 calibration', () => {
  expect(keyColor(light(17), key(20, 20), bounds, 0.3, 3)).toEqual([10, 15, 20]);
});
const point = (x: number, y: number) => key(x * 100 - 5, y * 100 - 5);
const pulse = { scanLength: 80, pulseAxis: { x: 64, y: 0, slope: 0 } };
it('Pulsating oscillates at the reported off-center source with dark space outside the band', () => {
  const l = light(17);
  expect(keyColor(l, point(0.64, 0.5), bounds, 0, 0, pulse)).toEqual(l.color);
  expect(keyColor(l, point(0.64, 0.05), bounds, 0, 1, pulse)).toBeNull();
  expect(keyColor(l, point(0.64, 0.95), bounds, 0, 2, pulse)).toBeNull();
});
it('Pulsating has the same phase at equal distances on opposite sides of its source', () => {
  const l = light(17);
  for (const t of [0, 0.2, 0.4, 0.7]) for (const y of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    expect(keyColor(l, point(0.44, y), bounds, t, 0, pulse)).toEqual(keyColor(l, point(0.84, y), bounds, t, 27, pulse));
  }
});
it('Pulsating emits the same crest toward both edges as time advances', () => {
  const l = light(17);
  // At phase .75 the source is at the bottom; one quarter-cycle later the crest is farther out.
  expect(keyColor(l, point(0.64, 0.94), bounds, 0.75 * 0.395, 0, pulse)).toEqual(l.color);
  for (const x of [0.64 - 1 / 6, 0.64 + 1 / 6]) {
    expect(keyColor(l, point(x, 0.94), bounds, 0.395, 1, pulse)).toEqual(l.color);
    expect(keyColor(l, point(x, 0.94), bounds, 0.75 * 0.395, 2, pulse)).toBeNull();
  }
});
it('Pulsating uses the reported slanted boundary rather than the keyboard geometric center', () => {
  const l = light(17), slanted = { scanLength: 80, pulseAxis: { x: 60, y: 0, slope: 0.1 } };
  expect(keyColor(l, point(0.65, 0.5), bounds, 0, 0, slanted)).toEqual(l.color);
  expect(keyColor(l, point(0.5, 0.5), bounds, 0, 1, slanted)).toBeNull();
});
it('Pulsating retains single color, brightness, periodicity and index independence', () => {
  const l = light(17, { brightness: 3 });
  for (const idx of [0, 27]) for (const t of [0.75 * 0.395, 1.75 * 0.395]) {
    expect(keyColor(l, point(0.64, 0.94), bounds, t, idx, pulse)).toEqual([72, 108, 144]);
  }
});
it('the preview hook derives its source line from key9 and the right edge of Space', () => {
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(200);
  const keys = S75PRO.layout!, l = light(17);
  useEffectPreview(l, keys, undefined, true);
  const cleanup = hooks.effect!();
  const minX = Math.min(...keys.map(k => k.x)), minY = Math.min(...keys.map(k => k.y));
  const b = { minX, minY, w: Math.max(...keys.map(k => k.x + k.w)) - minX, h: Math.max(...keys.map(k => k.y + k.h)) - minY };
  const nine = keys.find(k => k.code === 0x26)!, space = keys.find(k => k.code === 0x2c)!;
  const x = nine.x + nine.w / 2, y = nine.y + nine.h / 2;
  const context = { scanLength: keys.length, pulseAxis: { x, y, slope: (space.x + space.w - x) / (space.y + space.h / 2 - y) } };
  const expected = Object.fromEntries(keys.flatMap((k, i) => {
    const color = keyColor(l, k, b, 0.2, i, context); return color ? [[k.code, color]] : [];
  }));
  expect(hooks.frames.at(-1)).toEqual(expected);
  if (typeof cleanup === 'function') cleanup();
});
it('the preview hook scans by physical row and column, not by source array order', () => {
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(200);
  const bottom = key(30, 50, 6), topRight = key(50, 10, 5), topLeft = key(10, 10, 4);
  useEffectPreview(light(16), [bottom, topRight, topLeft], undefined, true);
  const cleanup = hooks.effect!();
  expect(hooks.frames.at(-1)![bottom.code]).toBeUndefined();
  expect(hooks.frames.at(-1)![topRight.code]).toEqual([120, 180, 240]);
  expect(hooks.frames.at(-1)![topLeft.code]).toEqual([80, 120, 160]);
  if (typeof cleanup === 'function') cleanup();
});

it('Pulsating matches the measured 1.58s video cycle at speed1', () => {
  const l = light(17, { speed: 1 });
  for (const t of [1.185, 2.765]) expect(keyColor(l, point(0.64, 0.94), bounds, t, 0, pulse)).toEqual(l.color);
  expect(keyColor(l, point(0.64, 0.94), bounds, 1.58, 0, pulse)).toBeNull();
});
