// Monitor on/off through resources/display-watch.ps1 (powerMonitor doesn't have it).
import type { DisplayPowerState } from '@shared/ipc';
import { runPsWatcher } from './psWatch';

export function watchDisplayPower(onState: (state: DisplayPowerState) => void, log: (message: string) => void): () => void {
  return runPsWatcher('display-watch.ps1', ['on', 'off'] as const, onState, log);
}
