// music bars and pictures sampled onto the keys, for live lighting
import type { KeyDef } from './types';

export type Rgb = [number, number, number];
export type Frame = Record<number, Rgb>;

const COLUMNS = 16;
const ROWS = 6;

export interface KeyCell {
  code: number;
  /** band (0 = bass) and row (0 = bottom) */
  col: number;
  row: number;
  /** key rect in 0..1 of the whole board */
  u0: number; v0: number; u1: number; v1: number;
}

export function keyCells(keys: KeyDef[]): KeyCell[] {
  const x0 = Math.min(...keys.map((k) => k.x)), x1 = Math.max(...keys.map((k) => k.x + k.w));
  const y0 = Math.min(...keys.map((k) => k.y)), y1 = Math.max(...keys.map((k) => k.y + k.h));
  const cx = (k: KeyDef): number => k.x + k.w / 2, cy = (k: KeyDef): number => k.y + k.h / 2;
  const cx0 = Math.min(...keys.map(cx)), cx1 = Math.max(...keys.map(cx));
  const cy0 = Math.min(...keys.map(cy)), cy1 = Math.max(...keys.map(cy));
  return keys.map((k) => ({
    code: k.code,
    col: Math.min(COLUMNS - 1, Math.floor(((cx(k) - cx0) / (cx1 - cx0 || 1)) * COLUMNS)),
    row: ROWS - 1 - Math.round(((cy(k) - cy0) / (cy1 - cy0 || 1)) * (ROWS - 1)),
    u0: (k.x - x0) / (x1 - x0), v0: (k.y - y0) / (y1 - y0), u1: (k.x + k.w - x0) / (x1 - x0), v1: (k.y + k.h - y0) / (y1 - y0),
  }));
}

export const BAR_COLUMNS = COLUMNS;

// same order as in the official driver
export const RHYTHM_SCHEMES = ['traffic', 'rainbow', 'rainbowRev', 'gradient', 'cycle', 'white', 'red', 'orange', 'yellow', 'green', 'blue', 'ambient'] as const;
export type RhythmScheme = (typeof RHYTHM_SCHEMES)[number];

// official driver's list, without off
export const BACKGROUNDS: Rgb[] = [[255, 255, 255], [255, 0, 0], [255, 110, 0], [255, 200, 0], [0, 255, 0], [0, 230, 255], [0, 60, 255], [150, 0, 255]];

const SOLID: Partial<Record<RhythmScheme, Rgb>> = { white: [255, 255, 255], red: [255, 0, 0], orange: [255, 110, 0], yellow: [255, 200, 0], green: [0, 255, 0], blue: [0, 60, 255] };

export function hsv(h: number, s = 1, v = 1): Rgb {
  const f = (n: number): number => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

const scale = (c: Rgb, x: number): Rgb => [Math.round(c[0] * x), Math.round(c[1] * x), Math.round(c[2] * x)];

export interface BarOptions {
  scheme: RhythmScheme;
  /** seconds, for 'cycle' */
  time: number;
  background: Rgb | null;
  /** 0..1 */
  backgroundBrightness: number;
}

export function renderBars(cells: KeyCell[], levels: number[], o: BarOptions): Frame {
  const out: Frame = {};
  const bg: Rgb = o.background ? scale(o.background, o.backgroundBrightness) : [0, 0, 0];
  const cycle = hsv((o.time * 36) % 360); // one turn every 10 s
  if (o.scheme === 'ambient') {
    // whole board pulses with the volume
    const loud = levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length);
    for (const c of cells) out[c.code] = scale(cycle, Math.min(1, loud * 1.6));
    return out;
  }
  for (const c of cells) {
    const height = Math.round(Math.max(0, Math.min(1, levels[c.col] ?? 0)) * ROWS);
    if (c.row >= height) { out[c.code] = bg; continue; }
    switch (o.scheme) {
      case 'traffic': out[c.code] = c.row >= ROWS - 1 ? [255, 0, 0] : c.row >= ROWS - 3 ? [255, 200, 0] : [0, 255, 0]; break;
      case 'rainbow': out[c.code] = hsv((c.col / COLUMNS) * 300); break;
      case 'rainbowRev': out[c.code] = hsv(300 - (c.col / COLUMNS) * 300); break;
      case 'gradient': out[c.code] = hsv(200 + (c.row / (ROWS - 1)) * 120); break;
      case 'cycle': out[c.code] = cycle; break;
      default: out[c.code] = SOLID[o.scheme] ?? [255, 255, 255];
    }
  }
  return out;
}

/** FFT bins (0..255) to BAR_COLUMNS log bands, 40 Hz - 14 kHz. */
export function bandLevels(bins: ArrayLike<number>, sampleRate: number, gain: number): number[] {
  const n = bins.length;
  const hzPerBin = sampleRate / 2 / n;
  const lo = 40, hi = 14000;
  const out: number[] = [];
  for (let b = 0; b < COLUMNS; b++) {
    const f0 = lo * (hi / lo) ** (b / COLUMNS), f1 = lo * (hi / lo) ** ((b + 1) / COLUMNS);
    const i0 = Math.max(0, Math.floor(f0 / hzPerBin)), i1 = Math.min(n - 1, Math.max(i0, Math.ceil(f1 / hzPerBin) - 1));
    let peak = 0;
    for (let i = i0; i <= i1; i++) peak = Math.max(peak, bins[i]);
    out.push(Math.max(0, Math.min(1, (peak / 255) * gain)));
  }
  return out;
}

/** bars jump up and fall slowly */
export function settle(prev: number[], next: number[], fall = 0.07): number[] {
  return next.map((v, i) => Math.max(v, (prev[i] ?? 0) - fall));
}

/** average colour per key */
export function sampleKeys(cells: KeyCell[], rgba: ArrayLike<number>, w: number, h: number, brightness = 1): Frame {
  const out: Frame = {};
  for (const c of cells) {
    const xa = Math.max(0, Math.floor(c.u0 * w)), xb = Math.min(w, Math.max(xa + 1, Math.ceil(c.u1 * w)));
    const ya = Math.max(0, Math.floor(c.v0 * h)), yb = Math.min(h, Math.max(ya + 1, Math.ceil(c.v1 * h)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const i = (y * w + x) * 4; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++; }
    out[c.code] = n ? [Math.round((r / n) * brightness), Math.round((g / n) * brightness), Math.round((b / n) * brightness)] : [0, 0, 0];
  }
  return out;
}
