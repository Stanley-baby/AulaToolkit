// Streams live frames (setLiveLight, op 0x20) to a keyboard, one loop per keyboard. Frames also go to
// store.liveLight for the keyboard picture since the LED read-back pauses while we write.
import { modelById } from '@shared/models';
import { BACKGROUNDS, RHYTHM_SCHEMES, keyCells, renderBars, sampleKeys, settle, type Frame } from '@shared/liveLighting';
import type { KeyAnimation, KeyDef, MusicEffect } from '@shared/types';
import { audioLevels } from './audio';
import { decodeImage, drawKeyAnimation } from './media';
import { activeProfile, useStore } from './store';
import { breathingFrame } from './perKeyBreathing';

const FRAME_MS = 47; // same as the official driver (~21 fps). TODO: see if it takes faster
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export type Source = (now: number) => Frame;

interface Loop { stop: boolean; done: Promise<void> }
const loops = new Map<string, Loop>();

async function run(modelId: string, loop: Loop, source: Source, kind: 'animation' | 'rhythm' | 'breathing'): Promise<void> {
  let fails = 0;
  while (!loop.stop) {
    const t0 = performance.now();
    const dev = useStore.getState().deviceFor(modelId);
    if (!dev || dev.link !== 'usb') { await sleep(500); continue; }
    const frame = source(t0);
    try {
      const k = kind === 'breathing' ? activeProfile(useStore.getState(), modelId)?.keyboard : undefined;
      const taken = k
        ? await window.aula.call<boolean>(dev.key, 'setLiveLight', frame, { colors: k.perKey, brightness: k.lighting.brightness })
        : await window.aula.call<boolean>(dev.key, 'setLiveLight', frame);
      fails = 0;
      if (taken) useStore.setState((s) => ({ liveLight: { ...s.liveLight, [modelId]: { colors: frame, at: Date.now(), source: kind } } }));
    } catch {
      if (++fails > 10) await sleep(1000); // unplugged or busy, slow down
    }
    const wait = FRAME_MS - (performance.now() - t0);
    if (wait > 0) await sleep(wait);
  }
}

export function startLive(modelId: string, source: Source, kind: 'animation' | 'rhythm' | 'breathing'): void {
  const loop: Loop = { stop: false, done: Promise.resolve() };
  loop.done = run(modelId, loop, source, kind);
  loops.set(modelId, loop);
}

export async function stopLive(modelId: string): Promise<void> {
  const loop = loops.get(modelId);
  if (!loop) return;
  loop.stop = true;
  loops.delete(modelId);
  await loop.done;
}

const keysOf = (modelId: string): KeyDef[] => (modelById(modelId)?.layout ?? []) as KeyDef[];

export function breathingSource(modelId: string): Source {
  const start = performance.now();
  const maximum = modelById(modelId)?.lightRange?.brightness ?? 5;
  return now => {
    const k = activeProfile(useStore.getState(), modelId)?.keyboard;
    return k ? breathingFrame(k.perKey, k.lighting.brightness, maximum, now - start) : {};
  };
}

export const MUSIC_DEFAULTS = { kind: 'rhythm' as const, scheme: 4, amplitude: 50, background: -1, backgroundBrightness: 30 };

export function rhythmSource(modelId: string, m: MusicEffect): Source {
  const cells = keyCells(keysOf(modelId));
  const scheme = RHYTHM_SCHEMES[m.scheme ?? MUSIC_DEFAULTS.scheme] ?? 'cycle';
  const gain = (m.amplitude ?? MUSIC_DEFAULTS.amplitude) / 50;
  const bgIndex = m.background ?? MUSIC_DEFAULTS.background;
  const background = bgIndex >= 0 ? BACKGROUNDS[bgIndex] ?? null : null;
  const backgroundBrightness = (m.backgroundBrightness ?? MUSIC_DEFAULTS.backgroundBrightness) / 100;
  let levels: number[] = [];
  return (now) => {
    // cut the noise floor
    const raw = audioLevels(1).map((x) => Math.max(0, Math.min(1, ((x - 0.35) / 0.65) * gain)));
    levels = settle(levels, raw);
    return renderBars(cells, levels, { scheme, time: now / 1000, background, backgroundBrightness });
  };
}

interface KeyFrames { frames: Frame[]; starts: number[]; total: number }
const gifCache = new Map<string, KeyFrames>();

async function keyFrames(modelId: string, a: KeyAnimation): Promise<KeyFrames | null> {
  const id = `${modelId}|${a.libraryId}|${a.mode}|${a.rotation ?? 0}|${a.averageColor !== false}|${a.brightness}`;
  const hit = gifCache.get(id);
  if (hit) return hit;
  const dataUrl = await window.aula.libraryGet(a.libraryId);
  if (!dataUrl) return null;
  const decoded = await decodeImage(dataUrl);
  const keys = keysOf(modelId);
  const cells = keyCells(keys);
  // Draw at the keyboard's aspect ratio, then sample per key.
  const wKeys = Math.max(...keys.map((k) => k.x + k.w)) - Math.min(...keys.map((k) => k.x));
  const hKeys = Math.max(...keys.map((k) => k.y + k.h)) - Math.min(...keys.map((k) => k.y));
  const w = 192, h = Math.max(1, Math.round((w * hKeys) / wKeys));
  const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = a.averageColor !== false;
  const frames: Frame[] = [], starts: number[] = [];
  let total = 0, batchStart = performance.now();
  for (const f of decoded) {
    drawKeyAnimation(ctx, f.bitmap, w, h, a.mode, a.rotation ?? 0);
    frames.push(sampleKeys(cells, ctx.getImageData(0, 0, w, h).data, w, h, a.brightness / 100, a.averageColor !== false));
    starts.push(total);
    total += f.delayMs;
    f.bitmap.close();
    // Yield between short batches so changing sampling never monopolises the UI thread.
    if (performance.now() - batchStart >= 8) { await sleep(0); batchStart = performance.now(); }
  }
  const out = { frames, starts, total };
  gifCache.set(id, out);
  return out;
}

export async function animationSource(modelId: string, a: KeyAnimation): Promise<Source | null> {
  const kf = await keyFrames(modelId, a);
  if (!kf || !kf.frames.length) return null;
  const t0 = performance.now();
  const speed = a.speed > 0 ? a.speed : 1;
  return (now) => {
    if (kf.frames.length === 1) return kf.frames[0];
    // frame at this point of the loop (short ones get skipped)
    const t = (((now - t0) * speed) % kf.total + kf.total) % kf.total;
    let lo = 0, hi = kf.starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (kf.starts[mid] <= t) lo = mid; else hi = mid - 1; }
    return kf.frames[lo];
  };
}
