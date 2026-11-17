import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ last: new Uint8Array(64), write: vi.fn(), feature: vi.fn() }));
vi.mock('../src/main/hid/transport', () => ({
  HidPort: { open: async (info: { path: string }) => ({
    info, path: info.path, exclusive: async (fn: () => Promise<unknown>) => fn(), close: async () => undefined, drain: async () => undefined,
    write: async (id: number, frame: Uint8Array) => { mocks.last.fill(0); mocks.last.set(frame); mocks.write(id, frame); },
    sendFeature: async (id: number, frame: Uint8Array) => { mocks.last.set(frame); mocks.feature(id, frame); },
    getFeature: async () => Buffer.from([0, ...mocks.last]),
    flushInput: () => undefined, nextInput: async () => Buffer.from(mocks.last.subarray(0, 32)),
  }) },
  hasFeatureReport: async () => true, pathIface: () => 0,
  hex: () => '', sleep: async () => undefined, waitPrecise: async () => undefined,
}));
import { Aula04Driver } from '../src/main/hid/drivers/aula04Driver';
import { EffectTracker } from '../src/shared/effectTracker';
import { S75PRO } from '../src/shared/models/s75pro';
import * as P from '../src/shared/protocols/aula04';
const host = process.platform;
afterEach(() => { Object.defineProperty(process, 'platform', { value: host }); vi.restoreAllMocks(); vi.clearAllMocks(); });

const attach = (link: string, id = 's75pro') => Aula04Driver.attach({ ...S75PRO, id, features: { ...S75PRO.features, perkey: false } }, [
  link === 'usb' ? { vendorId: 0x0c45, productId: 0x800a, release: 1, path: 'usb', interface: 0 }
    : { vendorId: 0x05ac, productId: 0x024f, release: 1, path: 'radio', interface: 3, usagePage: 0xff60 },
], { log: vi.fn(), onStatus: vi.fn() });

// Radio hardware acceptance: Static=10, Single On=11, Single Off=12, Breath=16.
// The remaining entries are the cyclic-order candidate, not individual hardware acceptances.
const candidate = [0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 1, 2, 3, 4, 5, 6, 7, 8, 9];
describe('Mac S75 Pro logical effect IDs versus firmware IDs', () => {
  it.each([['usb', false], ['usb', true], ['radio', false], ['radio', true]] as const)(
    '%s colorful=%s applies the candidate order without altering app IDs or other fields', async (link, colorful) => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const driver = (await attach(link))!;
      const perKey = vi.spyOn(driver, 'setUserLight').mockResolvedValue(undefined);
      try {
        for (const mode of [...S75PRO.lightModes!.map(m => m.mode), P.USER_LIGHT_MODE]) {
          mocks.feature.mockClear(); mocks.write.mockClear();
          const lighting = { mode, color: [21, 140, 67] as [number, number, number], colorful, brightness: 3, speed: 2, direction: 1 };
          await driver.setLighting(lighting);
          const payload = P.lightPayload({ ...lighting, mode: candidate[mode] ?? mode });
          if (link === 'usb') {
            expect(mocks.feature.mock.calls.map(c => [...c[1]]), `logical mode ${mode}`).toEqual([
              P.command(P.OP.BEGIN), P.command(P.OP.LIGHT, 0, 1), payload, P.command(P.OP.END), P.command(P.OP.APPLY),
            ].map(frame => [...frame]));
          } else {
            expect(mocks.write.mock.calls.map(c => [...c[1]]), `logical mode ${mode}`).toEqual([
              [...P.dongleShort(P.DONGLE_CMD.LIGHT, payload)],
            ]);
          }
          expect(lighting.mode).toBe(mode);
        }
        expect(perKey).not.toHaveBeenCalled();
      } finally { await driver.close(); }
    },
  );

  it.each([['win32', 's75pro'], ['linux', 's75pro'], ['darwin', 'other']] as const)(
    '%s %s preserves the existing firmware numbering', async (platform, id) => {
      Object.defineProperty(process, 'platform', { value: platform });
      const driver = (await attach('radio', id))!;
      try {
        for (const mode of [0, 1, 2, 3, 7, 10, 19, P.USER_LIGHT_MODE]) {
          mocks.write.mockClear();
          const lighting = { mode, color: [255, 0, 0] as [number, number, number], colorful: false, brightness: 3, speed: 2, direction: 0 };
          await driver.setLighting(lighting);
          expect(mocks.write.mock.calls.map(c => [...c[1]])).toEqual([[...P.dongleShort(P.DONGLE_CMD.LIGHT, P.lightPayload(lighting))]]);
        }
      } finally { await driver.close(); }
    },
  );
});

it.each(['darwin', 'win32'])('%s only tracks firmware effects when its effect order is supported', async platform => {
  Object.defineProperty(process, 'platform', { value: platform });
  const driver = (await attach('usb'))!;
  const guess = vi.spyOn(EffectTracker.prototype, 'setMode');
  try {
    await driver.noteLightMode(10);
    if (platform === 'darwin') expect(guess).not.toHaveBeenCalled();
    else expect(guess).toHaveBeenCalledWith(10);
  } finally { await driver.close(); }
});

it('restores the saved static per-key colors before closing a breathing session', async () => {
  const driver = (await attach('usb'))!;
  const steady = { 4: [120, 0, 0] as [number, number, number] };
  // The mock acknowledges the operation with 0 rather than 1; the fallback must survive a failed frame too.
  await driver.setLiveLight({ 4: [12, 0, 0] }, { colors: steady, brightness: 4 }).catch(() => undefined);
  const restore = vi.spyOn(driver, 'setUserLight').mockResolvedValue(undefined);
  await driver.close();
  expect(restore).toHaveBeenCalledWith(steady, 4);
  await expect(driver.call('setLiveLight', [{}])).rejects.toThrow('Device is closed');
});
it('does not restore stale breathing colors after selecting another lighting mode', async () => {
  const driver = (await attach('usb'))!;
  await driver.setLiveLight({}, { colors: { 4: [255, 0, 0] }, brightness: 5 }).catch(() => undefined);
  await driver.setLighting({ mode: 1, color: [0, 255, 0], brightness: 3, speed: 3, direction: 0, colorful: false });
  const restore = vi.spyOn(driver, 'setUserLight').mockResolvedValue(undefined);
  await driver.close();
  expect(restore).not.toHaveBeenCalled();
});
