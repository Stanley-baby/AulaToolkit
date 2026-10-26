import { describe, expect, it } from 'vitest';
import { fitFrames } from '@shared/screenFrames';

const total = (x: { delayMs: number }[]): number => x.reduce((s, f) => s + f.delayMs, 0);

describe('fitFrames', () => {
  it('leaves short animations alone', () => {
    const frames = [{ delayMs: 100 }, { delayMs: 50 }, { delayMs: 70 }];
    expect(fitFrames(frames, 141)).toEqual([{ index: 0, delayMs: 100 }, { index: 1, delayMs: 50 }, { index: 2, delayMs: 70 }]);
  });

  it('spreads frames over the whole gif', () => {
    const frames = Array.from({ length: 300 }, () => ({ delayMs: 40 })); // 12 s
    const out = fitFrames(frames, 141);
    expect(out.length).toBe(141);
    expect(out[0].index).toBe(0);
    expect(out[out.length - 1].index).toBeGreaterThan(290); // reaches the end, not cut after 141 frames
    expect(Math.abs(total(out) - 12000)).toBeLessThan(141);
    expect(out.every((x, i) => i === 0 || x.index > out[i - 1].index)).toBe(true);
  });

  it('respects the minimum delay', () => {
    const frames = Array.from({ length: 100 }, () => ({ delayMs: 20 })); // 2 s at 50 fps
    const out = fitFrames(frames, 141, 30);
    expect(out.every((x) => x.delayMs >= 30)).toBe(true);
    expect(out.length).toBe(66);
    expect(Math.abs(total(out) - 2000)).toBeLessThan(66);
  });

  it('keeps a long pause', () => {
    // 2 s pause between fast frames
    const frames = [...Array.from({ length: 100 }, () => ({ delayMs: 20 })), { delayMs: 2000 }, ...Array.from({ length: 100 }, () => ({ delayMs: 20 }))];
    const out = fitFrames(frames, 50);
    const pause = out.find((x) => x.index === 100)!;
    expect(Math.abs(pause.delayMs - 2000)).toBeLessThan(2 * (6000 / 50));
    expect(Math.abs(total(out) - 6000)).toBeLessThan(50);
  });
});
