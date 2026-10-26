// Fit an animation into the screen's frame limit without changing its speed.

export interface TimedFrame { delayMs: number }

// spread `max` frames evenly over the gif's length, the same frame twice in a row = one longer frame.
// min delay because the screen can't do < 30 ms
export function fitFrames(frames: TimedFrame[], max: number, minDelayMs = 0): { index: number; delayMs: number }[] {
  if (frames.length <= max && frames.every((f) => f.delayMs >= minDelayMs)) return frames.map((f, index) => ({ index, delayMs: f.delayMs }));
  const starts: number[] = [];
  let total = 0;
  for (const f of frames) { starts.push(total); total += f.delayMs; }
  const count = Math.max(1, Math.min(max, minDelayMs > 0 ? Math.floor(total / minDelayMs) : max));
  const step = total / count;
  const out: { index: number; delayMs: number }[] = [];
  let i = 0;
  for (let k = 0; k < count; k++) {
    const t = k * step;
    while (i + 1 < frames.length && starts[i + 1] <= t) i++;
    const last = out[out.length - 1];
    if (last && last.index === i) last.delayMs += step;
    else out.push({ index: i, delayMs: step });
  }
  return out.map((x) => ({ index: x.index, delayMs: Math.round(x.delayMs) }));
}
