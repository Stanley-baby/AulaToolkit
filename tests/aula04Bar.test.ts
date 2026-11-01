import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ write: vi.fn(), send: vi.fn(), last: new Uint8Array(32) }));
vi.mock('../src/main/hid/transport', () => ({
  HidPort: { open: async (info: { path: string }) => ({
    info, path: info.path, close: async () => undefined,
    exclusive: async (fn: () => Promise<unknown>) => fn(),
    write: async (id: number, frame: Uint8Array) => { mocks.last.set(frame); mocks.write(id, frame); },
    flushInput: () => undefined, nextInput: async () => Buffer.from(mocks.last),
    sendFeature: mocks.send, getFeature: async () => Buffer.alloc(65),
  }) },
  hasFeatureReport: async () => true, pathIface: (d: { interface: number }) => d.interface,
  hex: () => '', sleep: async () => undefined, waitPrecise: async () => undefined,
}));
import { Aula04Driver } from '../src/main/hid/drivers/aula04Driver';
import { S75PRO } from '../src/shared/models/s75pro';
const host = process.platform;
afterEach(() => { Object.defineProperty(process, 'platform', { value: host }); vi.clearAllMocks(); });

describe('verified Mac S75 receiver side-light switch', () => {
  it.each([
    ['darwin', 's75pro', 0x29, 0x24],
    ['darwin', 's75pro', 0x20, 0x21],
    ['darwin', 's75pro', 0x21, 0x21],
    ['darwin', 's75pro', 0x25, 0x21],
    ['darwin', 's75pro', 0x24, 0x21],
    ['win32', 's75pro', 0x29, 0x29],
    ['win32', 's75pro', 0x25, 0x25],
    ['linux', 's75pro', 0x29, 0x29],
    ['darwin', 'other', 0x29, 0x29],
  ] as const)('%s %s profile=%i sends=%i', async (platform, id, requested, actual) => {
    Object.defineProperty(process, 'platform', { value: platform });
    const d = (await Aula04Driver.attach({ ...S75PRO, id, features: { ...S75PRO.features, perkey: false } }, [
      { vendorId: 0x05ac, productId: 0x024f, release: 1, path: 'radio', interface: 3, usagePage: 0xff60 },
    ], { log: vi.fn(), onStatus: vi.fn() }))!;
    expect(d.link).toBe('2.4g');
    mocks.write.mockClear();
    await d.setBarLight(requested);
    expect(mocks.write).toHaveBeenCalledOnce();
    const [reportId, frame] = mocks.write.mock.calls[0];
    expect(reportId).toBe(0);
    expect([...frame.slice(0, 4)]).toEqual([0x05, 1, 0, actual]);
    expect([...frame.slice(17, 19)]).toEqual([0xaa, 0x55]);
    expect(frame[31]).toBe([...frame.slice(0, 31)].reduce((a, b) => a + b, 0) & 0xff);
    expect(mocks.send).not.toHaveBeenCalled();
    await d.close();
  });

  it.each(['darwin', 'win32'])('%s keeps USB side-light payload unchanged', async (platform) => {
    Object.defineProperty(process, 'platform', { value: platform });
    const d = (await Aula04Driver.attach({ ...S75PRO, features: { ...S75PRO.features, perkey: false } }, [
      { vendorId: 0x0c45, productId: 0x800a, release: 1, path: 'usb', interface: 0 },
    ], { log: vi.fn(), onStatus: vi.fn() }))!;
    await d.setBarLight(0x29);
    const payload = mocks.send.mock.calls.map(c => c[1]).find(p => p[0] === 0x29);
    expect(payload?.[0]).toBe(0x29);
    expect([...payload.slice(14, 16)]).toEqual([0xaa, 0x55]);
    expect(mocks.write).not.toHaveBeenCalled();
    await d.close();
  });
});
