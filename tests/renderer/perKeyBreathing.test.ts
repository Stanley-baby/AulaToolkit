import { expect, it } from 'vitest';
import { breathingFrame } from '../../src/renderer/src/perKeyBreathing';

const colors = { 4: [255, 0, 0] as [number, number, number], 5: [0, 120, 240] as [number, number, number] };
it('preserves each key color at the peak and repeats after three seconds', () => {
  expect(breathingFrame(colors, 5, 5, 0)).toEqual(colors);
  expect(breathingFrame(colors, 5, 5, 3000)).toEqual(colors);
});
it('dims all assigned keys together without filling unpainted keys', () => {
  expect(breathingFrame(colors, 5, 5, 750)).toEqual({ 4: [128, 0, 0], 5: [0, 60, 120] });
  expect(breathingFrame(colors, 5, 5, 1500)).toEqual({ 4: [0, 0, 0], 5: [0, 0, 0] });
  expect(breathingFrame(colors, 5, 5, 2250)).toEqual({ 4: [127, 0, 0], 5: [0, 60, 120] });
});
it('respects the configured brightness without mutating saved colors', () => {
  expect(breathingFrame(colors, 1, 5, 0)).toEqual({ 4: [51, 0, 0], 5: [0, 24, 48] });
  expect(breathingFrame(colors, 0, 5, 0)).toEqual({ 4: [0, 0, 0], 5: [0, 0, 0] });
  expect(colors[4]).toEqual([255, 0, 0]);
});
