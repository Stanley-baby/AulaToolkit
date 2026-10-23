// Spots lighting changes made on the keyboard itself (Fn shortcuts, the knob) from the live per-key
// colours the S75 Pro reports (op 0xF5 returns what the LEDs show right now). The keyboard never says
// which effect, colour or brightness is active, so this works from the picture: the dominant colour
// and the brightest LED. Effect changes are recognised separately (effectTracker.ts). Pure logic, no I/O.

export type Rgb = [number, number, number];
export type LightColor = Rgb | 'multi';

/** `quiet` marks a follow-up of a change reported moments ago: record it, but don't announce it again. */
export type LightChange =
  | { change: 'color'; color: LightColor; quiet?: boolean }
  | { change: 'brightness'; level: number; max: number; quiet?: boolean }
  /** Effect recognised by EffectTracker (effectTracker.ts). */
  | { change: 'mode'; mode: number };

export interface FrameInfo {
  /** Brightest channel of any LED. */
  peak: number;
  /** LEDs that are visibly on. */
  lit: number;
  /** One shared hue (normalised to full brightness), several hues, or too dark to tell. */
  color: LightColor | null;
}

const ON = 12;
const SAME_COLOR = 50; // per-channel tolerance on the 0..255 normalised colour

export function analyzeFrame(px: Rgb[]): FrameInfo {
  let peak = 0;
  let lit = 0;
  for (const c of px) {
    const m = Math.max(c[0], c[1], c[2]);
    if (m > peak) peak = m;
    if (m >= ON) lit++;
  }
  const floor = Math.max(24, peak * 0.35);
  const strong = px.filter((c) => Math.max(c[0], c[1], c[2]) >= floor);
  if (strong.length < 3) return { peak, lit, color: null };
  const norm = strong.map((c) => { const m = Math.max(c[0], c[1], c[2]); return c.map((v) => (v / m) * 255) as Rgb; });
  const mean = [0, 1, 2].map((i) => norm.reduce((s, c) => s + c[i], 0) / norm.length) as Rgb;
  const single = norm.every((c) => c.every((v, i) => Math.abs(v - mean[i]) <= SAME_COLOR));
  if (!single) return { peak, lit, color: 'multi' };
  const m = Math.max(...mean);
  return { peak, lit, color: mean.map((v) => Math.round((v / m) * 255)) as Rgb };
}

export const sameColor = (a: LightColor, b: LightColor, tol = SAME_COLOR): boolean =>
  a === 'multi' || b === 'multi' ? a === b : a.every((v, i) => Math.abs(v - b[i]) <= tol);

const TIGHT_COLOR = 30;
const STABLE_FRAMES = 5;

/** Name key for a colour, used by the OSD (colRed, colBlue, … colMulti). */
export function colorKey(c: LightColor): string {
  if (c === 'multi') return 'colMulti';
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 0.3) return 'colWhite';
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 340) return 'colRed';
  if (h < 45) return 'colOrange';
  if (h < 70) return 'colYellow';
  if (h < 160) return 'colGreen';
  if (h < 200) return 'colCyan';
  if (h < 255) return 'colBlue';
  if (h < 290) return 'colPurple';
  return 'colPink';
}

interface Sample { t: number; info: FrameInfo }

const WINDOW_MS = 9000; // longer than one slow breathing cycle
const STEADY = 10;      // peak spread that counts as a still picture

/**
 * Feed it one frame per poll; it returns the changes it is confident about. The first readings only
 * set the baseline, and reset() starts over (call it after the app itself writes the lighting).
 */
export class LightWatcher {
  private samples: Sample[] = [];
  private color: LightColor | undefined;
  private level: number | undefined;
  private levelVotes = 0;
  private pendingLevel: number | undefined;
  private lastReport = -Infinity;

  constructor(private readonly levels = 5) {}

  reset(): void {
    this.samples = [];
    this.color = undefined;
    this.level = undefined;
    this.pendingLevel = undefined;
    this.levelVotes = 0;
  }

  push(px: Rgb[], now = Date.now()): LightChange[] {
    const info = analyzeFrame(px);
    this.samples.push({ t: now, info });
    while (this.samples.length && now - this.samples[0].t > WINDOW_MS) this.samples.shift();
    const out: LightChange[] = [];

    // Colour: the last readings that show a colour agree closely. Effects whose hue keeps drifting
    // (Spectrum) never settle, so they do not report a stream of colour changes.
    const colored = this.samples.filter((s) => s.info.color !== null).slice(-STABLE_FRAMES).map((s) => s.info.color!);
    const last = colored[colored.length - 1];
    if (colored.length === STABLE_FRAMES && colored.every((c) => sameColor(c, last, TIGHT_COLOR))) {
      const c = last;
      if (this.color !== undefined && !sameColor(c, this.color)) out.push({ change: 'color', color: c });
      this.color = c;
    }

    // Brightness: a still picture gives it directly; an animated one needs the peak over a full cycle.
    const peaks = this.samples.slice(-4).map((s) => s.info.peak);
    const steady = peaks.length === 4 && Math.max(...peaks) - Math.min(...peaks) <= STEADY;
    const covered = this.samples.length > 1 && now - this.samples[0].t >= WINDOW_MS - 1000;
    const est = steady ? peaks.reduce((a, b) => a + b, 0) / peaks.length : covered ? Math.max(...this.samples.map((s) => s.info.peak)) : null;
    if (est !== null && est >= ON) {
      const lv = Math.max(1, Math.min(this.levels, Math.round(est / (255 / this.levels))));
      if (this.level === undefined) this.level = lv;
      else if (lv !== this.level) {
        this.levelVotes = this.pendingLevel === lv ? this.levelVotes + 1 : 1;
        this.pendingLevel = lv;
        if (this.levelVotes >= 2) { out.push({ change: 'brightness', level: lv, max: this.levels }); this.level = lv; this.levelVotes = 0; }
      } else this.levelVotes = 0;
    }

    // One action on the keyboard can show up as several changes a moment apart; announce only the first.
    const recent = now - this.lastReport < 3000;
    for (const c of out) if (c.change !== 'mode' && (recent || c !== out[0])) c.quiet = true;
    if (out.length && !recent) this.lastReport = now;
    return out;
  }

  /** Something else (a recognised effect change) was just announced: keep follow-ups quiet. */
  announced(now = Date.now()): void { this.lastReport = now; }
}
