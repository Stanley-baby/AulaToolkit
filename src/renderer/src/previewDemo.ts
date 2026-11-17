export const REACTIVE_MODES = new Set([2, 3, 13, 14, 15]);

/** Foreground time only; settings changes do not re-arm a completed selection. */
export class PreviewDemo {
  mode = -1;
  phase: 'waiting' | 'playing' | 'done' = 'done';
  private elapsed = 0;
  private last = 0;
  private active = false;
  private nextPress = 0;

  select(mode: number, now: number): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.reset(REACTIVE_MODES.has(mode) ? 'waiting' : 'done', now);
  }
  private reset(phase: typeof this.phase, now: number): void {
    this.phase = phase; this.elapsed = 0; this.last = now; this.nextPress = 0;
  }
  cancel(): boolean {
    const playing = this.phase === 'playing';
    this.phase = 'done';
    return playing;
  }
  replay(now: number): void {
    if (REACTIVE_MODES.has(this.mode)) this.reset('playing', now);
  }
  tick(now: number, active: boolean): { playing: boolean; trigger: boolean } {
    if (active && this.active) this.elapsed += Math.max(0, now - this.last);
    this.last = now; this.active = active;
    if (this.phase === 'waiting' && this.elapsed >= 5000) this.reset('playing', now);
    if (this.phase === 'playing' && this.elapsed >= 4000) this.phase = 'done';
    const playing = this.phase === 'playing' && active;
    const trigger = playing && this.elapsed >= this.nextPress;
    if (trigger) this.nextPress = this.elapsed + 800;
    return { playing, trigger };
  }
}
