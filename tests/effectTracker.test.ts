import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { EffectTracker, effectFeatures, neighbourPairs, type Rgb } from '@shared/effectTracker';
import { S75PRO_KEYS } from '@shared/models/s75pro.layout';

const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 's75pro-knob-effects.json.gz'))).toString()) as { frames: { t: number; c: number[] }[] };
const toColors = (c: number[]): Rgb[] => Array.from({ length: c.length / 3 }, (_, i) => [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]] as Rgb);

/** Replays the recording and returns each effect the tracker reports, with the time it did. */
function replay(start: number | null): { t: number; mode: number }[] {
  const tr = new EffectTracker(S75PRO_KEYS);
  tr.setMode(start);
  const out: { t: number; mode: number }[] = [];
  for (const f of fixture.frames) {
    const m = tr.push(toColors(f.c), f.t);
    if (m !== null) out.push({ t: Math.round(f.t / 100) / 10, mode: m });
  }
  return out;
}

describe('EffectTracker on a real knob recording', () => {
  it('follows the knob through the effects in order', () => {
    // Recorded: 18 → 19 → (Off, briefly) → 1 → 2 → … → 9 → 10, then 11 and 12 within a second
    // each → 13 (dark). Glittering (4) looks almost like Single Off (3) in its colourful variant, so
    // that step is only noticed one step later; the steps through 11 and 12 were too quick to see.
    expect(replay(18).map((x) => x.mode)).toEqual([19, 1, 2, 3, 5, 6, 7, 8, 9, 10, 13]);
  });
});

describe('EffectTracker on vendor music frames', () => {
  // Music Rhythm from the official driver, recorded with the app running. Used to be read as a dark
  // effect and overwrote the profile (Glittering became Single On).
  const music = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 's75pro-vendor-music.json.gz'))).toString()) as { frames: { t: number; c: number[] }[] };
  it('never reports a change', () => {
    for (const start of [1, 4, 11, 16, 18]) {
      const tr = new EffectTracker(S75PRO_KEYS);
      tr.setMode(start);
      const got = music.frames.map((f) => tr.push(toColors(f.c), f.t)).filter((m) => m !== null);
      expect(got, `starting from ${start}`).toEqual([]);
    }
  });
});

describe('effectFeatures', () => {
  const pairs = neighbourPairs(S75PRO_KEYS);
  const n = S75PRO_KEYS.length;
  it('describes a dark board as all zeros', () => {
    expect(effectFeatures(Array.from({ length: 6 }, () => Array.from({ length: n }, () => [0, 0, 0] as Rgb)), pairs)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('sees breathing as a brightness swing', () => {
    const frames = Array.from({ length: 12 }, (_, i) => Array.from({ length: n }, () => [0, 0, Math.round(20 + 230 * Math.abs(Math.sin(i / 3)))] as Rgb));
    expect(effectFeatures(frames, pairs)[5]).toBeGreaterThan(0.3);
  });
});

describe('EffectTracker without a starting point', () => {
  it('does not guess between effects that are dark when idle', () => {
    const tr = new EffectTracker(S75PRO_KEYS);
    const dark = Array.from({ length: S75PRO_KEYS.length }, () => [0, 0, 0] as Rgb);
    let got: number | null = null;
    for (let t = 0; t < 5000; t += 160) got = tr.push(dark, t) ?? got;
    expect(got).toBeNull();
  });
});
