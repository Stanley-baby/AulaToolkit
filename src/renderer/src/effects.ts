// Animated preview of the keyboard lighting effects, modelled on the Sonix firmware the S75 Pro runs
// (the same 19 effects the vendor driver lists). Reactive effects respond to real key presses while the
// app has focus; optional demonstrations are bounded and labelled by the panel.
import { useEffect, useRef, useState } from 'react';
import type { KeyDef, LightingState } from '@shared/types';
import { USER_LIGHT_MODE } from '@shared/protocols/aula04';
import { hidFromDomCode } from '@shared/keycodes';
import { PreviewDemo, REACTIVE_MODES } from './previewDemo';

type RGB = [number, number, number];

const hsv = (h: number, s = 1, v = 1): RGB => {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};
const scale = (c: RGB, k: number): RGB => { k = Math.max(0, Math.min(1, k)); return [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)]; };
const hash = (n: number): number => { let x = (n * 2654435761) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; x ^= x >>> 15; return (x >>> 0) / 4294967296; };

/** Seconds per cycle for speed levels 0..5 (level 5 = fastest), tuned against the keyboard. */
const PERIOD = [5.0, 4.0, 3.0, 2.2, 1.5, 1.0];

interface Press { x: number; y: number; t: number; key: number }
interface Bounds { minX: number; minY: number; w: number; h: number }

let presses: Press[] = [];

/** Records a received keystroke or an explicitly labelled demonstration press. */
export function notifyPress(key: KeyDef, b: Bounds, now: number): void {
  presses.push({ x: (key.x + key.w / 2 - b.minX) / b.w, y: (key.y + key.h / 2 - b.minY) / b.h, t: now, key: key.code });
  if (presses.length > 24) presses.shift();
}

export function keyColor(l: LightingState, k: KeyDef, b: Bounds, t: number, idx: number, s75?: { scanLength: number; pulseAxis?: { x: number; y: number; slope: number } }): RGB | null {
  // shortcut: speed1 measured at 1.58s; retain other speed ratios until each is video-calibrated.
  const pulseScale = s75?.pulseAxis && l.mode === 17 ? 1.58 / 4 : 1;
  const period = PERIOD[Math.max(0, Math.min(5, l.speed ?? 3))] * pulseScale;
  const ph = (t / period) % 1;                    // 0..1 phase of the current cycle
  const bright = Math.max(0, Math.min(1, (l.brightness ?? 5) / 5));
  const base: RGB = l.color;
  const x = (k.x + k.w / 2 - b.minX) / b.w;
  const y = (k.y + k.h / 2 - b.minY) / b.h;
  const aspect = b.h / b.w;
  const dirSign = l.direction === 1 || l.direction === 3 ? -1 : 1;
  const vertical = l.direction === 2 || l.direction === 3;
  const pos = vertical ? y : x;
  const colorAt = (phase: number): RGB => (l.colorful ? hsv(phase) : base);
  // Mac S75 observations: a dark band over a lit board, not a moving bright band.
  if (s75 && (l.mode === 10 || l.mode === 11)) {
    const axis = l.mode === 10 ? y : x;
    const phase = ((axis - dirSign * ph) % 1 + 1) % 1;
    const distance = Math.min(phase, 1 - phase);
    const level = 1 - 0.65 * Math.max(0, 1 - distance * 8);
    return scale(colorAt(axis), bright * level);
  }
  if (s75 && l.mode === 16) {
    // A few LEDs scan each row left-to-right, then restart after the bottom row.
    const head = Math.floor(ph * (s75.scanLength + 2));
    const ordinal = dirSign < 0 ? s75.scanLength - 1 - idx : idx;
    const distance = head - ordinal;
    return distance >= 0 && distance < 3 ? scale(colorAt(ph), bright * (1 - distance / 3)) : null;
  }
  if (s75?.pulseAxis && l.mode === 17) {
    // Source line follows key 9 to Space's right edge; equal phases travel outward on both sides.
    const axisX = (s75.pulseAxis.x + (k.y + k.h / 2 - s75.pulseAxis.y) * s75.pulseAxis.slope - b.minX) / b.w;
    const distance = Math.abs(x - axisX);
    const waveY = 0.5 + 0.44 * Math.sin((distance * 1.5 - ph) * Math.PI * 2);
    const level = Math.max(0, 1 - Math.abs(y - waveY) / 0.18);
    return level > 0 ? scale(colorAt(x), bright * level) : null;
  }
  const recent = presses.filter((p) => t - p.t < 2.5);
  let c: RGB | null;
  switch (l.mode) {
    case 0: return null;
    case 1: c = colorAt(0); break;                                                              // Static
    case 2: {                                                                                    // Single On: pressed key lights, fades out
      let v = 0; for (const p of recent) if (p.key === k.code) v = Math.max(v, 1 - (t - p.t) / (period * 0.4));
      c = v > 0 ? scale(colorAt(l.colorful ? hash(k.code) : 0), v) : null; break;
    }
    case 3: {                                                                                    // Single Off: all on, pressed key goes dark then returns
      let v = 1; for (const p of recent) if (p.key === k.code) v = Math.min(v, (t - p.t) / (period * 0.4));
      c = scale(colorAt(l.colorful ? x : 0), v); break;
    }
    case 4: {                                                                                    // Glittering: sparse random twinkles
      const seed = Math.floor(t / (period * 0.25)) * 131 + idx;
      const on = hash(seed) < 0.12; const age = (t / (period * 0.25)) % 1;
      c = on ? scale(colorAt(hash(seed + 1)), 1 - Math.abs(age - 0.5) * 2) : null; break;
    }
    case 5: {                                                                                    // Fluttering: every key pulses with its own rhythm
      const v = 0.5 + 0.5 * Math.sin(t / period * 6.28 + hash(idx) * 6.28);
      c = scale(colorAt(l.colorful ? hash(idx + 11) : 0), 0.15 + 0.85 * v); break;
    }
    case 6: c = hsv(x * 0.9); break;                                                             // Colourful: static rainbow across the board
    case 7: { const v = 0.5 - 0.5 * Math.cos(ph * 6.28); c = scale(colorAt(Math.floor(t / period) * 0.13), 0.04 + 0.96 * v); break; } // Breath
    case 8: c = hsv(ph); break;                                                                  // Spectrum: whole board cycles hue
    case 9: { const d = Math.hypot(x - 0.5, (y - 0.5) * aspect) / 0.56; const v = 0.5 + 0.5 * Math.cos((d - ph) * 6.28); c = scale(colorAt(l.colorful ? d - ph : 0), 0.1 + 0.9 * v); break; } // Outward rings
    case 10: { const v = 0.5 + 0.5 * Math.cos((pos - dirSign * ph) * 6.28); c = scale(colorAt(l.colorful ? pos - dirSign * ph : 0), 0.1 + 0.9 * v); break; } // Scrolling band
    case 11: { const d = x + y * aspect; const v = 0.5 + 0.5 * Math.cos((d - dirSign * ph) * 6.28); c = scale(colorAt(l.colorful ? d - dirSign * ph : 0), 0.1 + 0.9 * v); break; } // Rolling diagonal
    case 12: { const a = Math.atan2((y - 0.5) * aspect, x - 0.5) / 6.283 + 0.5; const v = Math.max(0, Math.cos(((a - dirSign * ph) % 1) * 6.28)); c = scale(colorAt(l.colorful ? a : 0), 0.08 + 0.92 * v); break; } // Rotating beam
    case 13: {                                                                                   // Explode: ring bursts from pressed keys
      let v = 0;
      for (const p of recent) { const age = (t - p.t) / (period * 0.6); if (age > 1) continue; const d = Math.hypot(x - p.x, (y - p.y) * aspect); v = Math.max(v, Math.max(0, 1 - Math.abs(d - age * 0.9) * 7) * (1 - age)); }
      c = v > 0 ? scale(colorAt(l.colorful ? x : 0), v) : null; break;
    }
    case 14: {                                                                                   // Launch: the pressed key's column shoots up and down
      let v = 0;
      for (const p of recent) { const age = (t - p.t) / (period * 0.5); if (age > 1 || Math.abs(x - p.x) > 0.035) continue; const dy = Math.abs(y - p.y); v = Math.max(v, Math.max(0, 1 - Math.abs(dy - age) * 5) * (1 - age)); }
      c = v > 0 ? scale(colorAt(l.colorful ? hash(idx) : 0), v) : null; break;
    }
    case 15: {                                                                                   // Ripples: expanding rings from pressed keys
      let v = 0.05;
      for (const p of recent) { const age = (t - p.t) / (period * 0.8); if (age > 1) continue; const d = Math.hypot(x - p.x, (y - p.y) * aspect); v += Math.max(0, 1 - Math.abs(d - age * 1.1) * 8) * (1 - age); }
      c = scale(colorAt(l.colorful ? x : 0), Math.min(1, v)); break;
    }
    case 16: c = hsv(pos * 1.4 - dirSign * ph); break;                                           // Flowing: rainbow drifting across
    case 17: { const v = 0.5 + 0.5 * Math.sin(t / period * 6.28 * 1.5 + hash(idx) * 6.28); c = scale(colorAt(l.colorful ? hash(idx + 5) : 0), 0.08 + 0.92 * v * v); break; } // Pulsating
    case 18: { const d = (x - y * 0.45 + 0.45) / 1.45; const v = 0.5 + 0.5 * Math.cos((d - dirSign * ph) * 6.28); c = scale(colorAt(l.colorful ? d - dirSign * ph : 0), 0.1 + 0.9 * v); break; } // Tilt
    case 19: { const p = 0.5 - 0.5 * Math.cos(ph * 6.28); const v = Math.max(0, 1 - Math.abs(pos - p) * 6); c = scale(colorAt(l.colorful ? p : 0), 0.06 + 0.94 * v); break; } // Shuttle
    default: c = colorAt(0);
  }
  return c ? scale(c, bright) : null;
}

const REACTIVE = REACTIVE_MODES;

export const boundsOf = (keys: KeyDef[]): Bounds => {
  const minX = Math.min(...keys.map((k) => k.x)), minY = Math.min(...keys.map((k) => k.y));
  return { minX, minY, w: Math.max(...keys.map((k) => k.x + k.w)) - minX, h: Math.max(...keys.map((k) => k.y + k.h)) - minY };
};

/** Live colour map for the on-screen keyboard. */
export function useEffectPreview(l: LightingState | undefined, keys: KeyDef[], perKey: Record<number, RGB> | undefined, calibrateS75 = false, demo?: { enabled: boolean; request: number; onPlaying: (playing: boolean) => void }): Record<number, RGB> {
  const [colors, setColors] = useState<Record<number, RGB>>({});
  const raf = useRef(0);
  const demoRef = useRef<{ clock: PreviewDemo; request: number; playing: boolean; key: number } | null>(null);
  useEffect(() => {
    if (!l || !keys.length) return;
    if (l.mode === USER_LIGHT_MODE) { setColors(perKey ?? {}); return; }
    const b = boundsOf(keys);
    const previewKeys = calibrateS75 && l.mode === 16 ? [...keys].sort((a, b) => a.y - b.y || a.x - b.x) : keys;
    const nine = calibrateS75 && l.mode === 17 ? keys.find(k => k.code === 0x26) : undefined;
    const space = calibrateS75 && l.mode === 17 ? keys.find(k => k.code === 0x2c) : undefined;
    const pulseAxis = nine && space ? {
      x: nine.x + nine.w / 2, y: nine.y + nine.h / 2,
      slope: (space.x + space.w - nine.x - nine.w / 2) / (space.y + space.h / 2 - nine.y - nine.h / 2),
    } : undefined;
    const s75 = calibrateS75 ? { scanLength: keys.length, pulseAxis } : undefined;
    const animated = ![0, 1, 6].includes(l.mode);
    const start = performance.now();
    if (!demoRef.current) demoRef.current = { clock: new PreviewDemo(), request: demo?.request ?? 0, playing: false, key: 0 };
    const state = demoRef.current;
    state.clock.select(l.mode, start);
    if (!demo?.enabled) state.clock.cancel();
    else if (state.request !== demo.request) state.clock.replay(start);
    state.request = demo?.request ?? 0;
    const setPlaying = (value: boolean): void => {
      if (value !== state.playing) { state.playing = value; demo?.onPlaying(value); }
    };
    const onBlur = (): void => {
      state.clock.tick(performance.now(), false);
      if (state.playing) presses = [];
      setPlaying(false);
    };
    presses = [];
    let last = 0;
    const onKey = (e: KeyboardEvent): void => {
      if (state.clock.cancel()) presses = [];
      setPlaying(false);
      const hid = hidFromDomCode(e.code); const k = keys.find((x) => x.code === hid);
      if (k && !e.repeat) notifyPress(k, b, (performance.now() - start) / 1000);
    };
    if (REACTIVE.has(l.mode)) window.addEventListener('keydown', onKey);
    if (demo) window.addEventListener('blur', onBlur);
    const frame = (): void => {
      const now = performance.now();
      const t = (now - start) / 1000;
      if (demo?.enabled) {
        const status = state.clock.tick(now, document.hasFocus() && !document.hidden);
        if (state.playing && !status.playing) presses = [];
        setPlaying(status.playing);
        if (status.trigger) notifyPress(keys[state.key++ % keys.length], b, t);
      }
      if (now - last > 33) {
        last = now;
        const out: Record<number, RGB> = {};
        previewKeys.forEach((k, i) => { const c = keyColor(l, k, b, t, i, s75); if (c) out[k.code] = c; });
        setColors(out);
      }
      if (animated) raf.current = requestAnimationFrame(frame);
    };
    frame();
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener('keydown', onKey); window.removeEventListener('blur', onBlur); setPlaying(false); };
  }, [l, keys, perKey, calibrateS75, demo?.enabled, demo?.request, demo?.onPlaying]);
  return colors;
}
