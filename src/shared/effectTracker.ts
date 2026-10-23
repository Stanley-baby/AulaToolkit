// Follows the S75 Pro lighting effect when it is changed on the keyboard (Fn shortcut or the knob).
// The keyboard never reports its effect; it only reports the colour each LED shows (op 0xF5). Two
// facts make tracking possible anyway:
//  - each effect has a recognisable picture over a couple of seconds (how many keys are lit, how often
//    they switch, how fast colours move, whether colour changes along rows or columns, breathing);
//  - the knob and the Fn shortcut step through the effects in their numeric order, one at a time.
// So when the picture changes, the new effect is almost always the next or the previous one, and only
// those two need telling apart. Signatures were measured on an S75 Pro (colourful variants, speed 3).
// Effects that are dark until a key is pressed (2, 13, 14, 15) look identical while idle, so steps
// between them can go unseen until a visible effect follows. Pure logic, no I/O.
import type { KeyDef } from './types';

export type Rgb = [number, number, number];

/** Knob / Fn order: 1 → 19, then Off (0), then back to 1. */
export const S75_EFFECT_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0];

// Feature vector: [lit fraction, lit toggles per reading, colour motion, colour change along rows,
// colour change along columns, brightness swing (breathing)].
const DARK = [0, 0, 0, 0, 0, 0];
export const S75_EFFECT_SIGNATURES: Record<number, number[][]> = {
  1: [[0.99, 0.02, 0.02, 0.17, 0.07, 0], [1, 0, 0, 0, 0, 0]], // Static: rainbow, or one colour
  2: [DARK],
  3: [[1, 0, 0, 0.35, 0.38, 0]],
  4: [[0.92, 0.03, 0, 0.34, 0.35, 0.02]],
  5: [[0.4, 0.35, 0, 0.33, 0.35, 0.11]],
  6: [[0.99, 0.02, 0.11, 0.35, 0.79, 0]],
  7: [[0.82, 0.06, 0, 0, 0, 0.89]],
  8: [[1, 0, 0.04, 0, 0, 0]],
  9: [[0.99, 0.02, 0.12, 0.16, 0.07, 0]],
  10: [[1, 0.01, 0.09, 0, 0.33, 0]],
  11: [[1, 0, 0.11, 0.11, 0.03, 0]],
  12: [[1, 0, 0.11, 0.07, 0.2, 0]],
  13: [DARK],
  14: [DARK],
  15: [DARK],
  16: [[0.12, 0.1, 0, 0.41, 0.04, 0.11]],
  17: [[0.6, 0.36, 0.13, 0.37, 0.38, 0.06]],
  18: [[0.53, 0.47, 0, 0.38, 0.36, 0.1]],
  19: [[1, 0, 0.11, 0.11, 0.48, 0]],
  0: [DARK],
};

const WEIGHTS = [2, 2, 3, 2, 2, 2];
const ON = 12;
const WINDOW_MS = 2000;
const EVAL_MS = 500;
const CHANGED = 0.12;  // feature distance that counts as a different picture (noise within one effect stays below ~0.15 only briefly)
const STEP_COST = 0.07; // per knob step away from the current effect

interface Pairs { rows: [number, number][]; cols: [number, number][] }

/** Neighbouring keys along rows and down columns, by index into `keys`. */
export function neighbourPairs(keys: KeyDef[]): Pairs {
  const byRow = new Map<number, number[]>();
  keys.forEach((k, i) => { const r = Math.round((k.y + k.h / 2) / 37); byRow.set(r, [...(byRow.get(r) ?? []), i]); });
  const rows: [number, number][] = [];
  for (const idx of byRow.values()) {
    idx.sort((a, b) => keys[a].x - keys[b].x);
    for (let i = 1; i < idx.length; i++) rows.push([idx[i - 1], idx[i]]);
  }
  const cols: [number, number][] = [];
  keys.forEach((k, i) => {
    const cx = k.x + k.w / 2, cy = k.y + k.h / 2;
    const j = keys.findIndex((q) => { const dy = q.y + q.h / 2 - cy; return dy > 25 && dy < 50 && Math.abs(q.x + q.w / 2 - cx) < 20; });
    if (j >= 0) cols.push([i, j]);
  });
  return { rows, cols };
}

/** Hue difference of two LEDs with brightness factored out (0 = same colour), or null if either is off. */
function colourDistance(a: Rgb, b: Rgb): number | null {
  const ma = Math.max(a[0], a[1], a[2]), mb = Math.max(b[0], b[1], b[2]);
  if (ma < ON || mb < ON) return null;
  return (Math.abs(a[0] / ma - b[0] / mb) + Math.abs(a[1] / ma - b[1] / mb) + Math.abs(a[2] / ma - b[2] / mb)) / 3;
}

const mean = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** Signature of a run of readings; each reading lists the LED colours in `keys` order. */
export function effectFeatures(frames: Rgb[][], pairs: Pairs): number[] {
  const isOn = (c: Rgb): boolean => Math.max(c[0], c[1], c[2]) >= ON;
  const lit = frames.map((f) => f.filter(isOn).length / f.length);
  const peaks = frames.map((f) => Math.max(...f.map((c) => Math.max(c[0], c[1], c[2]))));
  const toggles: number[] = [], motion: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    toggles.push(a.filter((c, k) => isOn(c) !== isOn(b[k])).length / a.length);
    const d = a.map((c, k) => colourDistance(c, b[k])).filter((x): x is number => x !== null);
    motion.push(mean(d));
  }
  const along = (p: [number, number][]): number => mean(frames.map((f) => p.map(([i, j]) => colourDistance(f[i], f[j])).filter((x): x is number => x !== null)).filter((d) => d.length).map(mean));
  const pk = mean(peaks);
  const swing = Math.sqrt(mean(peaks.map((p) => (p - pk) ** 2))) / Math.max(pk, 1);
  return [mean(lit), mean(toggles), mean(motion), along(pairs.rows), along(pairs.cols), swing];
}

const distance = (a: number[], b: number[]): number => Math.sqrt(a.reduce((s, x, i) => s + WEIGHTS[i] * (x - b[i]) ** 2, 0));

export class EffectTracker {
  private frames: { t: number; colors: Rgb[] }[] = [];
  private settled: number[] | null = null;
  private changeSince: number | null = null;
  private lastEval = 0;
  private readonly pairs: Pairs;

  /** Current effect, or null while unknown. */
  mode: number | null = null;

  constructor(private readonly keys: KeyDef[], private readonly order = S75_EFFECT_ORDER, private readonly signatures = S75_EFFECT_SIGNATURES) {
    this.pairs = neighbourPairs(keys);
  }

  /** The effect is known (the app just set it, or the profile says so): start from it. */
  setMode(mode: number | null): void {
    this.mode = mode !== null && this.order.includes(mode) ? mode : null;
    this.frames = [];
    this.settled = null;
    this.changeSince = null;
  }

  private fit(f: number[], mode: number): number {
    return Math.min(...(this.signatures[mode] ?? [DARK]).map((s) => distance(f, s)));
  }

  private decide(f: number[]): number | null {
    const all = this.order;
    if (this.mode === null) {
      const global = all.reduce((a, b) => (this.fit(f, b) < this.fit(f, a) ? b : a));
      // Without a starting point, a dark picture could be any of the dark effects: don't guess.
      const alike = all.filter((m) => this.fit(f, m) - this.fit(f, global) < 0.05);
      return alike.length > 1 ? null : global;
    }
    // The knob moves one step at a time, but a step between similar pictures can go unseen; so every
    // effect is a candidate, at a cost for each step away from the current one (forward slightly
    // preferred, as when the knob keeps turning the same way).
    const i = all.indexOf(this.mode);
    const score = (m: number): number => {
      const fwd = (all.indexOf(m) - i + all.length) % all.length, back = (i - all.indexOf(m) + all.length) % all.length;
      const cost = fwd === 0 ? 0 : Math.min(fwd * STEP_COST, back * STEP_COST + 0.01);
      return this.fit(f, m) + cost;
    };
    return [this.mode, ...all.filter((m) => m !== this.mode)].reduce((a, b) => (score(b) < score(a) ? b : a));
  }

  /** Adds one reading (LED colours in `keys` order). Returns the new effect when it changes. */
  push(colors: Rgb[], now = Date.now()): number | null {
    this.frames.push({ t: now, colors });
    while (this.frames.length && now - this.frames[0].t > WINDOW_MS) this.frames.shift();
    if (now - this.lastEval < EVAL_MS || this.frames.length < 4 || now - this.frames[0].t < WINDOW_MS * 0.75) return null;
    this.lastEval = now;
    const f = effectFeatures(this.frames.map((x) => x.colors), this.pairs);
    if (this.settled === null) {
      this.settled = f;
      const m = this.decide(f);
      if (m !== null && m !== this.mode) { this.mode = m; return m; }
      return null;
    }
    if (distance(f, this.settled) <= CHANGED) { this.changeSince = null; return null; }
    this.changeSince ??= now;
    if (now - this.changeSince < WINDOW_MS) return null; // let the window fill with the new picture
    this.settled = f;
    this.changeSince = null;
    const m = this.decide(f);
    if (m === null || m === this.mode) return null;
    this.mode = m;
    return m;
  }
}
