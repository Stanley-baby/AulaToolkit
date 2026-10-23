// In-between colours for the live keyboard view. Readings arrive a few times a second while the
// keyboard animates at a much higher rate. Blending RGB in a straight line makes a rainbow wave dip
// through dull, dark mixes (red → green passes through brown), which reads as jumping. Moving the hue
// around the colour wheel instead keeps the brightness steady, and the direction the hue was already
// turning picks the way round when a step is large.

export type Rgb = [number, number, number];

export function rgbToHsv([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

export function hsvToRgb([h, s, v]: [number, number, number]): Rgb {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round(r + m), Math.round(g + m), Math.round(b + m)];
}

/** Signed hue step from a to b, the short way round (−180..180). */
const hueStep = (a: number, b: number): number => ((b - a + 540) % 360) - 180;

/**
 * Colour at fraction k (0..1) between readings a and b. `before` is the reading preceding a; its hue
 * motion decides the direction when the step is ambiguous (more than ~120° apart).
 */
export function interpolate(before: Rgb | undefined, a: Rgb, b: Rgb, k: number): Rgb {
  const ha = rgbToHsv(a), hb = rgbToHsv(b);
  // Greys and near-black have no meaningful hue: blend those directly.
  if (ha[1] < 0.15 || hb[1] < 0.15 || ha[2] < 8 || hb[2] < 8) return a.map((v, i) => Math.round(v + (b[i] - v) * k)) as Rgb;
  let dh = hueStep(ha[0], hb[0]);
  if (before && Math.abs(dh) > 120) {
    const hp = rgbToHsv(before);
    const was = hp[1] >= 0.15 && hp[2] >= 8 ? hueStep(hp[0], ha[0]) : 0;
    if (was !== 0 && Math.sign(was) !== Math.sign(dh)) dh = dh > 0 ? dh - 360 : dh + 360;
  }
  const h = (ha[0] + dh * k + 360) % 360;
  return hsvToRgb([h, ha[1] + (hb[1] - ha[1]) * k, ha[2] + (hb[2] - ha[2]) * k]);
}
