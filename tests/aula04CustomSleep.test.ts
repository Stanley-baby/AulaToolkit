import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ last: new Uint8Array(32), release: 0xf104, write: vi.fn(), feature: vi.fn(), next: vi.fn() }));
vi.mock('../src/main/hid/transport', () => ({
  HidPort: { open: async (info: { path: string }) => ({
    info, path: info.path, close: async () => undefined, drain: async () => undefined, exclusive: async (fn: () => Promise<unknown>) => fn(),
    write: async (_id: number, frame: Uint8Array) => { mocks.last = new Uint8Array(frame); mocks.write(frame); },
    sendFeature: async (_id: number, frame: Uint8Array) => { mocks.feature(frame); },
    getFeature: async () => Buffer.alloc(65), flushInput: () => undefined, nextInput: mocks.next,
  }) },
  hasFeatureReport: async () => true, pathIface: (d: { interface: number }) => d.interface,
  hex: () => '', sleep: async () => undefined, waitPrecise: async () => undefined,
}));
import { Aula04Driver } from '../src/main/hid/drivers/aula04Driver';
import { S75PRO } from '../src/shared/models/s75pro';
import { customSleepSelector, sleepModeSelector, lightPayload, dongleShort, DONGLE_CMD, USER_LIGHT_MODE } from '../src/shared/protocols/aula04';

const host = process.platform;
const model = { ...S75PRO, features: { ...S75PRO.features, perkey: false } };
const settings = { winLock: 0, altF4: 0, altTab: 0, fnSwitch: 0, sleep: customSleepSelector(42), response: 1 };
const reply = (request: Uint8Array, valid = true): Buffer => {
  const r = new Uint8Array(32); r.set(request.subarray(0, 3));
  if (request[0] === 0x02) r.set([0x45, 0x0c, 0x0a, 0x80, mocks.release & 0xff, mocks.release >> 8], 7);
  if (request[0] === 0x20) r[3] = 80;
  r[31] = r.subarray(0, 31).reduce((sum, byte) => (sum + byte) & 0xff, 0) ^ (valid ? 0 : 1);
  return Buffer.from(r);
};

beforeEach(() => { vi.clearAllMocks(); mocks.release = 0xf104; mocks.next.mockImplementation(async () => reply(mocks.last)); });
afterEach(() => { Object.defineProperty(process, 'platform', { value: host }); vi.clearAllMocks(); });

describe('S75 Pro lighting after a firmware upgrade', () => {
  it.each([0x0103, 0xf104, 0xf105, 0xf106].flatMap(release => ['usb', 'radio'].map(link => [release, link] as const)))(
    'uses standard effect IDs on firmware %i over %s without changing the profile',
    async (release, link) => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mocks.release = release;
      const devices = link === 'usb'
        ? [{ vendorId: 0x0c45, productId: 0x800a, release, path: 'usb', interface: 0 }]
        : [{ vendorId: 0x05ac, productId: 0x024f, release: 1, path: 'radio', interface: 3, usagePage: 0xff60 }];
      const driver = (await Aula04Driver.attach(model, devices, { log: vi.fn(), onStatus: vi.fn() }))!;
      try {
        expect((await driver.status()).customSleep).toBe(release !== 0x0103);
        for (const mode of [...S75PRO.lightModes!.map(m => m.mode), USER_LIGHT_MODE]) {
          for (const colorful of [false, true]) {
            const lighting = { mode, color: [21, 140, 67] as [number, number, number], colorful, brightness: 3, speed: 2, direction: 1 };
            mocks.feature.mockClear(); mocks.write.mockClear();
            await driver.setLighting(lighting);
            const payload = lightPayload(lighting);
            if (link === 'usb') expect([...mocks.feature.mock.calls[2][0]]).toEqual([...payload]);
            else expect([...mocks.write.mock.calls[0][0]]).toEqual([...dongleShort(DONGLE_CMD.LIGHT, payload)]);
            expect(lighting.mode).toBe(mode);
          }
        }
      } finally { await driver.close(); }
    },
  );

  it('preserves the legacy radio calibration when the identity checksum is invalid', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    mocks.release = 0xf106;
    mocks.next.mockImplementation(async () => reply(mocks.last, false));
    const driver = (await Aula04Driver.attach(model, [
      { vendorId: 0x05ac, productId: 0x024f, release: 1, path: 'radio', interface: 3, usagePage: 0xff60 },
    ], { log: vi.fn(), onStatus: vi.fn() }))!;
    try {
      mocks.write.mockClear();
      await driver.setLighting({ mode: 1, color: [255, 0, 0], colorful: false, brightness: 3, speed: 2, direction: 0 });
      expect(mocks.write.mock.calls[0][0][3]).toBe(10);
    } finally { await driver.close(); }
  });
});

describe('S75 Pro custom sleep capability gate', () => {
  it('encodes both modes for every custom minute without changing public profile selectors', () => {
    for (let minutes = 1; minutes <= 120; minutes++) {
      const selector = customSleepSelector(minutes);
      expect(sleepModeSelector(selector, true)).toBe(selector);
      expect(sleepModeSelector(selector, false)).toBe(minutes + 3);
    }
    for (const [preset, minutes] of [[1, 1], [2, 5], [3, 30]]) {
      expect(sleepModeSelector(preset, true)).toBe(customSleepSelector(minutes));
      expect(sleepModeSelector(preset, false)).toBe(preset);
    }
    expect(sleepModeSelector(0, true)).toBe(0);
    expect(sleepModeSelector(0, false)).toBe(0);
    for (const value of [-1, 4, 127, 248, 1.5, NaN]) {
      expect(() => sleepModeSelector(value, true)).toThrow('CUSTOM_SLEEP_RANGE');
      expect(() => sleepModeSelector(value, false)).toThrow('CUSTOM_SLEEP_RANGE');
    }
  });

  it.each(['usb', 'radio'])('writes and switches quick wake on F105 over %s', async (link) => {
    mocks.release = 0xf105;
    const devices = link === 'usb'
      ? [{ vendorId: 0x0c45, productId: 0x800a, release: 0xf105, path: 'usb', interface: 0 }]
      : [{ vendorId: 0x05ac, productId: 0x024f, release: 1, path: 'radio', interface: 3, usagePage: 0xff60 }];
    const driver = (await Aula04Driver.attach(model, devices, { log: vi.fn(), onStatus: vi.fn() }))!;
    expect((await driver.status()).fastWakeControl).toBe(true);
    expect((await driver.status()).customSleep).toBe(true);
    for (const fastWake of [1, 0, 1]) {
      mocks.feature.mockClear(); mocks.write.mockClear();
      await driver.setSettings({ ...settings, fastWake });
      const frame = link === 'usb' ? mocks.feature.mock.calls[2][0] : mocks.write.mock.calls[0][0];
      expect(frame[link === 'usb' ? 6 : 9]).toBe(fastWake ? customSleepSelector(42) : 45);
      expect(settings.sleep).toBe(customSleepSelector(42));
    }
    mocks.feature.mockClear(); mocks.write.mockClear();
    expect(() => driver.setSettings({ ...settings, fastWake: 2 })).toThrow('SMART_SLEEP_UNSUPPORTED');
    expect(mocks.feature).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
    await driver.close();
  });

  it('blocks the mode switch on F104 before sending any data', async () => {
    const driver = (await Aula04Driver.attach(model, [{ vendorId: 0x0c45, productId: 0x800a, release: 0xf104, path: 'usb', interface: 0 }], { log: vi.fn(), onStatus: vi.fn() }))!;
    expect((await driver.status()).fastWakeControl).toBe(false);
    mocks.feature.mockClear();
    expect(() => driver.setSettings({ ...settings, fastWake: 0 })).toThrow('FAST_WAKE_UNSUPPORTED');
    expect(mocks.feature).not.toHaveBeenCalled();
    await driver.close();
  });

  it.each(['usb', 'radio'])('writes smart 3/5-minute settings on F106 over %s', async (link) => {
    mocks.release = 0xf106;
    const devices = link === 'usb'
      ? [{ vendorId: 0x0c45, productId: 0x800a, release: 0xf106, path: 'usb', interface: 0 }]
      : [{ vendorId: 0x05ac, productId: 0x024f, release: 1, path: 'radio', interface: 3, usagePage: 0xff60 }];
    const driver = (await Aula04Driver.attach(model, devices, { log: vi.fn(), onStatus: vi.fn() }))!;
    expect((await driver.status()).smartSleepControl).toBe(true);
    await driver.setSettings({ ...settings, sleep: customSleepSelector(3), fastWake: 2, deepSleepMinutes: 5 });
    const frame = link === 'usb' ? mocks.feature.mock.calls[2][0] : mocks.write.mock.calls.find(([packet]) => packet[0] === 0x07)![0];
    expect(frame[link === 'usb' ? 6 : 9]).toBe(0x7c);
    expect(frame[link === 'usb' ? 7 : 10]).toBe(3);
    expect(frame[link === 'usb' ? 9 : 12]).toBe(5);
    await driver.close();
  });

  it('allows a reviewed USB firmware and preserves the selector byte', async () => {
    const driver = (await Aula04Driver.attach(model, [{ vendorId: 0x0c45, productId: 0x800a, release: 0xf104, path: 'usb', interface: 0 }], { log: vi.fn(), onStatus: vi.fn() }))!;
    expect((await driver.status()).customSleep).toBe(true);
    mocks.feature.mockClear();
    await driver.setSettings(settings);
    expect(mocks.feature.mock.calls[2][0][6]).toBe(customSleepSelector(42));
    await driver.close();
  });

  it('rejects custom sleep before writing to an unreviewed USB firmware', async () => {
    const driver = (await Aula04Driver.attach(model, [{ vendorId: 0x0c45, productId: 0x800a, release: 0x0103, path: 'usb', interface: 0 }], { log: vi.fn(), onStatus: vi.fn() }))!;
    expect((await driver.status()).customSleep).toBe(false);
    mocks.feature.mockClear();
    expect(() => driver.setSettings(settings)).toThrow('CUSTOM_SLEEP_UNSUPPORTED');
    expect(mocks.feature).not.toHaveBeenCalled();
    await driver.close();
  });

  it('requires a checksummed matching radio identity before allowing a custom value', async () => {
    const radio = [{ vendorId: 0x05ac, productId: 0x024f, release: 1, path: 'radio', interface: 3, usagePage: 0xff60 }];
    const good = (await Aula04Driver.attach(model, radio, { log: vi.fn(), onStatus: vi.fn() }))!;
    expect((await good.status()).customSleep).toBe(true);
    mocks.write.mockClear();
    await good.setSettings(settings);
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(mocks.write.mock.calls[0][0][9]).toBe(customSleepSelector(42));
    await good.close();

    mocks.next.mockImplementation(async () => reply(mocks.last, false));
    const bad = (await Aula04Driver.attach(model, radio, { log: vi.fn(), onStatus: vi.fn() }))!;
    expect((await bad.status()).customSleep).toBe(false);
    mocks.write.mockClear();
    expect(() => bad.setSettings(settings)).toThrow('CUSTOM_SLEEP_UNSUPPORTED');
    expect(mocks.write).not.toHaveBeenCalled();
    await bad.close();
  });

  it('keeps an otherwise working receiver attached when the optional identity probe throws', async () => {
    const radio = [{ vendorId: 0x05ac, productId: 0x024f, release: 1, path: 'radio', interface: 3, usagePage: 0xff60 }];
    mocks.next.mockImplementation(async () => {
      if (mocks.last[0] === 0x02) throw new Error('receiver does not implement identity');
      return reply(mocks.last);
    });
    const driver = (await Aula04Driver.attach(model, radio, { log: vi.fn(), onStatus: vi.fn() }))!;
    expect(driver.link).toBe('2.4g');
    expect((await driver.status()).customSleep).toBe(false);
    await driver.close();
  });

  it('keeps the vendor preset selectors and rejects malformed values', async () => {
    const driver = (await Aula04Driver.attach(model, [{ vendorId: 0x0c45, productId: 0x800a, release: 0x0103, path: 'usb', interface: 0 }], { log: vi.fn(), onStatus: vi.fn() }))!;
    await expect(driver.setSettings({ ...settings, sleep: 3 })).resolves.toBeUndefined();
    expect(() => driver.setSettings({ ...settings, sleep: 4 })).toThrow('CUSTOM_SLEEP_RANGE');
    expect(() => driver.setSettings({ ...settings, sleep: 128.5 })).toThrow('CUSTOM_SLEEP_RANGE');
    await driver.close();
  });
});
