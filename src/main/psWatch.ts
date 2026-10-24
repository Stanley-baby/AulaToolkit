// Runs a PowerShell helper from resources/ that prints one state per line.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

const scriptPath = (name: string): string => app.isPackaged
  ? join(process.resourcesPath, name)
  : join(app.getAppPath(), 'resources', name);

export function runPsWatcher<S extends string>(script: string, states: readonly S[], onState: (state: S) => void, log: (message: string) => void): () => void {
  if (process.platform !== 'win32') return () => undefined;
  const path = scriptPath(script);
  if (!existsSync(path)) { log(`${script} missing`); return () => undefined; }
  let child: ChildProcess | null = null;
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let pending = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      pending += chunk.toString('utf8');
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const state = line.trim() as S;
        if (states.includes(state)) onState(state);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => log(`${script}: ${chunk.toString('utf8').trim()}`));
    child.on('error', (e) => log(`couldn't start ${script}: ${e.message}`));
    child.on('exit', (code) => { if (code && code !== 0) log(`${script} exited (${code})`); child = null; });
  } catch (e) {
    log(`couldn't start ${script}: ${(e as Error).message}`);
  }
  return () => { child?.kill(); child = null; };
}
