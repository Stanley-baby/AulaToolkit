import { describe, expect, it } from 'vitest';
import { hsvToRgb, interpolate, rgbToHsv, type Rgb } from '@shared/colorInterp';

describe('colorInterp', () => {
  it('round-trips through HSV', () => {
    for (const c of [[255, 0, 0], [12, 200, 77], [0, 0, 0], [255, 255, 255], [253, 115, 0]] as Rgb[]) {
      expect(hsvToRgb(rgbToHsv(c))).toEqual(c);
    }
  });

  it('keeps full brightness halfway from red to green (no muddy brown)', () => {
    const mid = interpolate(undefined, [255, 0, 0], [0, 255, 0], 0.5);
    expect(Math.max(...mid)).toBe(255);
    expect(mid).toEqual([255, 255, 0]); // yellow, the way a rainbow passes
  });

  it('follows the direction the hue was already turning on a large step', () => {
    // hue was decreasing (green 120° → red 0°), next step red → blue (240°): keep decreasing via magenta
    const mid = interpolate([0, 255, 0], [255, 0, 0], [0, 0, 255], 0.5);
    expect(rgbToHsv(mid)[0]).toBeCloseTo(300, 0);
  });

  it('blends greys directly', () => {
    expect(interpolate(undefined, [0, 0, 0], [200, 200, 200], 0.5)).toEqual([100, 100, 100]);
  });

  it('fades brightness on a steady hue (breathing)', () => {
    expect(interpolate(undefined, [0, 0, 250], [0, 0, 50], 0.5)).toEqual([0, 0, 150]);
  });
});
