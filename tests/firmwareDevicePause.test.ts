import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
import { DeviceManager } from '../src/main/hid/manager';

it('waits for ongoing device calls and rejects new calls before closing the keyboard', async () => {
  const manager = new DeviceManager();
  let finish!: () => void;
  const call = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  const close = vi.fn(async () => {});
  const driver = { model: { id: 's75pro' }, call, close };
  (manager as any).drivers.set('s75pro:usb', driver);

  const active = manager.call('s75pro:usb', 'writeSettings', []);
  const pause = manager.pauseForFirmware('s75pro');
  await expect(manager.call('s75pro:usb', 'readSettings', [])).rejects.toThrow('paused');
  expect(close).not.toHaveBeenCalled();
  finish();
  await active;
  await pause;
  expect(close).toHaveBeenCalledTimes(1);
  expect((manager as any).drivers.has('s75pro:usb')).toBe(false);
});

it('abandons preparation without flashing if the connection never closes', async () => {
  vi.useFakeTimers();
  try {
    const manager = new DeviceManager();
    (manager as any).drivers.set('s75pro:usb', {
      model: { id: 's75pro' }, close: () => new Promise<void>(() => {}), call: async () => 'available',
    });
    const pause = manager.pauseForFirmware('s75pro').catch((error) => error as Error);
    await vi.advanceTimersByTimeAsync(15000);
    expect((await pause as Error).message).toContain('did not release');
    await expect(manager.call('s75pro:usb', 'readSettings', [])).resolves.toBe('available');
  } finally {
    vi.useRealTimers();
  }
});

it('allows a verified keyboard to be discovered again after recovery', async () => {
  const manager = new DeviceManager();
  vi.spyOn(manager as any, 'scan').mockResolvedValue(undefined);
  manager.blockModel('s75pro');
  await manager.resumeAfterFirmware('s75pro', false);
  expect((manager as any).blockedModels.has('s75pro')).toBe(false);
});
