import type { Frame, Rgb } from '@shared/liveLighting';

/** A full-bright → dark → full-bright cycle; saved colors are never changed. */
export function breathingFrame(colors: Frame, brightness: number, maximum: number, elapsed: number): Frame {
  const gain = (0.5 + 0.5 * Math.cos(elapsed * Math.PI * 2 / 3000)) * brightness / maximum;
  return Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, color.map(v => Math.round(v * gain)) as Rgb]));
}
