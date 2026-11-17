import { afterEach, describe, expect, it, vi } from 'vitest';
const hid = vi.hoisted(() => ({ devices: vi.fn(), devicesAsync: vi.fn() }));
vi.mock('node-hid', () => ({ default: hid }));
import { listDevices } from '../src/main/hid/transport';
const platform = process.platform;
afterEach(() => { Object.defineProperty(process, 'platform', { value: platform }); vi.resetAllMocks(); });

describe('device enumeration does not block the macOS window thread', () => {
  it('awaits async enumeration without invoking the blocking API', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    let resolve!: (devices: any[]) => void;
    hid.devicesAsync.mockImplementation(() => new Promise(r => { resolve = r; }));
    const result = listDevices();
    expect(hid.devicesAsync).toHaveBeenCalledOnce();
    expect(hid.devices).not.toHaveBeenCalled();
    let settled = false;
    void result.then(() => { settled = true; });
    await new Promise(r => setTimeout(r, 0));
    expect(settled).toBe(false);
    const devices = [{ path: 'keyboard' }];
    resolve(devices);
    await expect(result).resolves.toEqual(devices);
  });
  it('preserves the empty-list fallback after an async scan failure', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    hid.devicesAsync.mockRejectedValue(new Error('enumeration failed'));
    await expect(listDevices()).resolves.toEqual([]);
  });
  it('preserves Windows enumeration and its error fallback', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    hid.devices.mockReturnValue([{ path: 'receiver' }]);
    await expect(listDevices()).resolves.toEqual([{ path: 'receiver' }]);
    expect(hid.devicesAsync).not.toHaveBeenCalled();
    hid.devices.mockImplementation(() => { throw new Error('scan failed'); });
    await expect(listDevices()).resolves.toEqual([]);
  });
});
