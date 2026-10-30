import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: vi.fn(() => () => undefined), powershell: vi.fn(() => () => undefined) }));
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '/application' } }));
vi.mock('../src/main/psWatch', () => ({ runStateWatcher: mocks.native, runPsWatcher: mocks.powershell }));
import { watchDisplayPower } from '../src/main/displayPower';
const platform = process.platform;
afterEach(() => { Object.defineProperty(process, 'platform', { value: platform }); vi.clearAllMocks(); });

describe('display notifications use the correct host implementation', () => {
  it('runs the native helper on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const state = vi.fn(), log = vi.fn();
    watchDisplayPower(state, log);
    expect(mocks.native).toHaveBeenCalledWith(join('/application', 'resources', 'mac', 'display-watch'), [], ['on', 'off'], state, log);
    expect(mocks.powershell).not.toHaveBeenCalled();
  });
  it('preserves the existing Windows watcher', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const state = vi.fn(), log = vi.fn();
    watchDisplayPower(state, log);
    expect(mocks.powershell).toHaveBeenCalledWith('display-watch.ps1', ['on', 'off'], state, log);
    expect(mocks.native).not.toHaveBeenCalled();
  });
});
