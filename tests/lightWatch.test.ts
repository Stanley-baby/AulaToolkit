import { describe, expect, it } from 'vitest';
import { analyzeFrame, colorKey, LightWatcher, type Rgb } from '@shared/lightWatch';

const KEYS = 82;
const solid = (c: Rgb): Rgb[] => Array.from({ length: KEYS }, () => [...c] as Rgb);
const rainbow = (shift: number, scale = 1): Rgb[] => Array.from({ length: KEYS }, (_, i) => {
  const h = ((i * 7 + shift) % 360) / 60;
  const x = Math.round(253 * (1 - Math.abs((h % 2) - 1)) * scale), m = Math.round(253 * scale);
  return ([[m, x, 0], [x, m, 0], [0, m, x], [0, x, m], [x, 0, m], [m, 0, x]][Math.floor(h) % 6]) as Rgb;
});

/** Feeds frames 500 ms apart and collects every reported change. */
function run(w: LightWatcher, frames: Rgb[][], start = 0): { t: number; c: ReturnType<LightWatcher['push']>[number] }[] {
  const out: { t: number; c: ReturnType<LightWatcher['push']>[number] }[] = [];
  frames.forEach((f, i) => { for (const c of w.push(f, start + i * 500)) out.push({ t: start + i * 500, c }); });
  return out;
}

describe('analyzeFrame', () => {
  it('finds a single colour regardless of brightness', () => {
    expect(analyzeFrame(solid([47, 0, 23])).color).toEqual([255, 0, 125]);
    expect(analyzeFrame(solid([47, 0, 23])).peak).toBe(47);
  });
  it('reports several hues as multicolour', () => {
    expect(analyzeFrame(rainbow(0)).color).toBe('multi');
  });
  it('has no colour for a dark board', () => {
    expect(analyzeFrame(solid([2, 0, 1])).color).toBeNull();
  });
});

describe('colorKey', () => {
  it('names common colours', () => {
    expect(colorKey([255, 0, 0])).toBe('colRed');
    expect(colorKey([253, 115, 0])).toBe('colOrange');
    expect(colorKey([255, 255, 0])).toBe('colYellow');
    expect(colorKey([0, 255, 0])).toBe('colGreen');
    expect(colorKey([0, 255, 255])).toBe('colCyan');
    expect(colorKey([0, 1, 253])).toBe('colBlue');
    expect(colorKey([255, 0, 255])).toBe('colPink');
    expect(colorKey([255, 255, 255])).toBe('colWhite');
    expect(colorKey('multi')).toBe('colMulti');
  });
});

describe('LightWatcher', () => {
  it('stays quiet while nothing changes', () => {
    const w = new LightWatcher();
    expect(run(w, Array.from({ length: 30 }, () => solid([0, 0, 250])))).toEqual([]);
  });

  it('reports a colour change once', () => {
    const w = new LightWatcher();
    const frames = [...Array.from({ length: 6 }, () => solid([0, 0, 250])), ...Array.from({ length: 6 }, () => solid([250, 0, 0]))];
    const ch = run(w, frames).map((x) => x.c);
    expect(ch).toEqual([{ change: 'color', color: [255, 0, 0] }]);
  });

  it('reports a brightness step on a still effect', () => {
    const w = new LightWatcher();
    const frames = [...Array.from({ length: 6 }, () => solid([250, 250, 0])), ...Array.from({ length: 8 }, () => solid([47, 47, 0]))];
    const ch = run(w, frames).map((x) => x.c);
    expect(ch).toEqual([{ change: 'brightness', level: 1, max: 5 }]);
  });

  it('does not mistake breathing for brightness changes', () => {
    const w = new LightWatcher();
    // ~6 s breathing cycle in blue, sampled every 500 ms for 30 s
    const frames = Array.from({ length: 60 }, (_, i) => solid([0, 0, Math.round(250 * (0.5 - 0.5 * Math.cos((i / 12) * 2 * Math.PI)))]));
    expect(run(w, frames).filter((x) => x.c.change === 'brightness')).toEqual([]);
  });

  it('reports switching from a still colour to an animated rainbow', () => {
    const w = new LightWatcher();
    const frames = [...Array.from({ length: 6 }, () => solid([250, 0, 0])), ...Array.from({ length: 8 }, (_, i) => rainbow(i * 40))];
    const ch = run(w, frames).map((x) => x.c);
    expect(ch).toEqual([{ change: 'color', color: 'multi' }]);
  });

  it('does not report colour changes while the hue keeps drifting (Spectrum)', () => {
    const w = new LightWatcher();
    // one full hue cycle every 8 s, sampled every 300 ms for 30 s
    const frames = Array.from({ length: 100 }, (_, i) => {
      const h = ((i * 0.3) / 8) * 6;
      const x = Math.round(250 * (1 - Math.abs((h % 2) - 1)));
      return solid(([[250, x, 0], [x, 250, 0], [0, 250, x], [0, x, 250], [x, 0, 250], [250, 0, x]][Math.floor(h) % 6]) as Rgb);
    });
    expect(run(w, frames).filter((x) => x.c.change === 'color')).toEqual([]);
  });

  it('starts over after reset', () => {
    const w = new LightWatcher();
    run(w, Array.from({ length: 6 }, () => solid([0, 250, 0])));
    w.reset();
    expect(run(w, Array.from({ length: 6 }, () => solid([250, 0, 0])), 10_000)).toEqual([]);
  });
});
