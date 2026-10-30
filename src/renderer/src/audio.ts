// System audio (loopback) as frequency levels for the music rhythm. Shared, only runs while needed.
import { isAudible } from '@shared/audioActivity';
import type { MediaPlaybackState } from '@shared/ipc';
import { bandLevels } from '@shared/liveLighting';

let users = 0;
let stream: MediaStream | null = null;
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let starting: Promise<boolean> | null = null;

async function open(): Promise<boolean> {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    for (const t of stream.getVideoTracks()) t.stop(); // audio only
    if (!stream.getAudioTracks().some((t) => t.readyState === 'live')) throw new Error('no system audio');
    ctx = new AudioContext();
    await ctx.resume();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.55;
    analyser.minDecibels = -80;
    analyser.maxDecibels = -20;
    ctx.createMediaStreamSource(stream).connect(analyser);
    bins = new Uint8Array(analyser.frequencyBinCount);
    return true;
  } catch {
    close();
    return false;
  }
}

function close(): void {
  for (const t of stream?.getTracks() ?? []) t.stop();
  void ctx?.close();
  stream = null; ctx = null; analyser = null; bins = null;
}

/** false if there is no system audio */
export function acquireAudio(): Promise<boolean> {
  users++;
  if (analyser) return Promise.resolve(true);
  starting ??= open().finally(() => { starting = null; });
  return starting;
}

export function releaseAudio(): void {
  users = Math.max(0, users - 1);
  if (!users) close();
}

export function audioLevels(gain: number): number[] {
  if (!analyser || !bins || !ctx) return bandLevels([], 48000, gain);
  analyser.getByteFrequencyData(bins);
  return bandLevels(bins, ctx.sampleRate, gain);
}

/** macOS has no public global media-session reader; sound activity drives the same lighting override. */
export function watchAudioPlayback(onState: (state: MediaPlaybackState) => void, onError: () => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let state: MediaPlaybackState = 'stopped';
  let audibleTicks = 0;
  let acquired = false;
  const release = (): void => { if (acquired) { acquired = false; releaseAudio(); } };
  void acquireAudio().then((ok) => {
    acquired = true;
    if (stopped) { release(); return; }
    if (!ok) { onError(); return; }
    const samples = new Uint8Array(analyser!.fftSize);
    timer = setInterval(() => {
      if (!analyser || !stream?.getAudioTracks().some((t) => t.readyState === 'live')) {
        onError(); if (timer) clearInterval(timer); onState('stopped'); release(); return;
      }
      analyser.getByteTimeDomainData(samples);
      audibleTicks = isAudible(samples) ? audibleTicks + 1 : 0;
      const next = audibleTicks >= 3 ? 'playing' : audibleTicks === 0 ? 'stopped' : state;
      if (next !== state) { state = next; onState(next); }
    }, 100);
  });
  return () => { stopped = true; if (timer) clearInterval(timer); release(); };
}
