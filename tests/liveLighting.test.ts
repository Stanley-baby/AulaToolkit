import { describe, expect, it } from 'vitest';
import { BAR_COLUMNS, bandLevels, keyCells, renderBars, sampleKeys, settle } from '@shared/liveLighting';
import { S75PRO_KEYS } from '@shared/models/s75pro.layout';

const cells = keyCells(S75PRO_KEYS);
const byName = (name: string) => cells.find((c) => c.code === S75PRO_KEYS.find((k) => k.name === name)!.code)!;

describe('keyCells', () => {
  it('Esc top-left, arrows bottom-right', () => {
    expect(byName('Esc')).toMatchObject({ col: 0, row: 5 });
    expect(byName('Esc').u0).toBe(0);
    const right = cells.reduce((a, b) => (b.u1 > a.u1 ? b : a));
    expect(right.u1).toBe(1);
    expect(Math.min(...cells.map((c) => c.row))).toBe(0);
    expect(Math.max(...cells.map((c) => c.col))).toBe(BAR_COLUMNS - 1);
  });
});

describe('renderBars', () => {
  it('fills columns from the bottom', () => {
    const levels = Array.from({ length: BAR_COLUMNS }, (_, i) => (i === 0 ? 0.5 : 0));
    const f = renderBars(cells, levels, { scheme: 'red', time: 0, background: [0, 0, 255], backgroundBrightness: 0.5 });
    for (const c of cells) {
      const lit = c.col === 0 && c.row < 3;
      expect(f[c.code], `${c.col}/${c.row}`).toEqual(lit ? [255, 0, 0] : [0, 0, 128]);
    }
  });
  it('traffic colours', () => {
    const f = renderBars(cells, Array(BAR_COLUMNS).fill(1), { scheme: 'traffic', time: 0, background: null, backgroundBrightness: 0 });
    const bottom = cells.find((c) => c.row === 0)!, top = cells.find((c) => c.row === 5)!;
    expect(f[bottom.code]).toEqual([0, 255, 0]);
    expect(f[top.code]).toEqual([255, 0, 0]);
  });
});

describe('bandLevels and settle', () => {
  it('bass ends up on the left', () => {
    const bins = new Uint8Array(1024);
    bins[2] = 255; // ~47 Hz at 48 kHz with 1024 bins
    const lv = bandLevels(bins, 48000, 0.5);
    expect(lv.length).toBe(BAR_COLUMNS);
    expect(lv[0]).toBeCloseTo(0.5);
    expect(lv.slice(3).every((x) => x === 0)).toBe(true);
  });
  it('lets bars fall slowly', () => {
    expect(settle([1, 0.2], [0, 0.5], 0.1)).toEqual([0.9, 0.5]);
  });
});

describe('sampleKeys', () => {
  it('averages per key', () => {
    // left red, right blue
    const w = 40, h = 10, rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(x < w / 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * w + x) * 4);
    const f = sampleKeys(cells, rgba, w, h);
    expect(f[byName('Esc').code]).toEqual([255, 0, 0]);
    const right = cells.reduce((a, b) => (b.u1 > a.u1 ? b : a));
    expect(f[right.code]).toEqual([0, 0, 255]);
  });
});
