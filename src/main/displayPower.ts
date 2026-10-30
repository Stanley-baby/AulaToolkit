// Native screen sleep/wake notifications on macOS, PowerShell display events on Windows.
import { app } from 'electron';
import { join } from 'node:path';
import type { DisplayPowerState } from '@shared/ipc';
import { runPsWatcher, runStateWatcher } from './psWatch';

export function watchDisplayPower(onState: (state: DisplayPowerState) => void, log: (message: string) => void): () => void {
  if (process.platform === 'darwin') {
    const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
    return runStateWatcher(join(base, 'mac', 'display-watch'), [], ['on', 'off'] as const, onState, log);
  }
  return runPsWatcher('display-watch.ps1', ['on', 'off'] as const, onState, log);
}
