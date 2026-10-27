// Media playing/stopped (resources/media-watch.ps1). Only runs while a music effect is on.
import { runPsWatcher } from './psWatch';
import type { MediaPlaybackState } from '@shared/ipc';

let stop: (() => void) | null = null;

export function setMediaWatch(on: boolean, onState: (state: MediaPlaybackState) => void, log: (message: string) => void): void {
  if (on && !stop) stop = runPsWatcher('media-watch.ps1', ['playing', 'stopped'] as const, onState, log);
  else if (!on && stop) { stop(); stop = null; }
}

export const stopMediaWatch = (): void => { stop?.(); stop = null; };
