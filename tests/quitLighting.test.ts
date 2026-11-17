import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

it.each([false, true])('waits for device restoration before quitting (failure=%s)', async failure => {
  const source = readFileSync('src/main/index.ts', 'utf8');
  const start = source.indexOf('  let devicesStopped = false;');
  const end = source.indexOf("  app.on('window-all-closed'", start);
  expect(start).toBeGreaterThan(-1);
  let beforeQuit!: (event: { preventDefault: () => void }) => void;
  let finish!: () => void;
  let reject!: (err: Error) => void;
  const stop = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
  const app = { on: (_: string, fn: typeof beforeQuit) => { beforeQuit = fn; }, quit: vi.fn() };
  const manager = { stop: vi.fn(() => stop), addLog: vi.fn() };
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { app, manager, firmwareUpdater: null, win: null, globalShortcut: { unregisterAll: vi.fn() }, stopMediaWatch: vi.fn(), stopDisplayPowerWatch: undefined, quitting: false });
  const event = { preventDefault: vi.fn() };
  beforeQuit(event); beforeQuit(event);
  expect(manager.stop).toHaveBeenCalledTimes(1);
  expect(app.quit).not.toHaveBeenCalled();
  if (failure) reject(new Error('disconnected')); else finish();
  await stop.catch(() => undefined); await Promise.resolve(); await Promise.resolve();
  expect(app.quit).toHaveBeenCalledTimes(1);
  event.preventDefault.mockClear();
  beforeQuit(event);
  expect(event.preventDefault).not.toHaveBeenCalled();
});

it('keeps the app running while firmware is being written', () => {
  const source = readFileSync('src/main/index.ts', 'utf8');
  const start = source.indexOf('  let devicesStopped = false;');
  const end = source.indexOf("  app.on('window-all-closed'", start);
  let beforeQuit!: (event: { preventDefault: () => void }) => void;
  const app = { on: (_: string, fn: typeof beforeQuit) => { beforeQuit = fn; }, quit: vi.fn() };
  const manager = { stop: vi.fn() };
  const win = { show: vi.fn() };
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { app, manager, win, firmwareUpdater: { snapshot: () => ({ busy: true }) } });
  const event = { preventDefault: vi.fn() };
  beforeQuit(event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(win.show).toHaveBeenCalled();
  expect(manager.stop).not.toHaveBeenCalled();
  expect(app.quit).not.toHaveBeenCalled();
});
