import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ write: vi.fn(), send: vi.fn(), next: vi.fn(), last: new Uint8Array(32) }));
vi.mock('../src/main/hid/transport', () => ({
  HidPort: { open: async (info: { path: string }) => ({
    info, path: info.path, close: async () => undefined,
    exclusive: async (fn: () => Promise<unknown>) => fn(),
    write: async (id: number, frame: Uint8Array) => { mocks.last.set(frame); mocks.write(id, frame); },
    flushInput: () => undefined, nextInput: mocks.next,
    sendFeature: mocks.send, getFeature: async () => Buffer.alloc(65),
  }) },
  hasFeatureReport: async () => true, pathIface: (d: { interface: number }) => d.interface,
  hex: () => '', sleep: async () => undefined, waitPrecise: async () => undefined,
}));
import { Aula04Driver } from '../src/main/hid/drivers/aula04Driver';
import { S75PRO } from '../src/shared/models/s75pro';
const host = process.platform;
beforeEach(() => { mocks.next.mockImplementation(async () => Buffer.from(mocks.last)); });
afterEach(() => { Object.defineProperty(process, 'platform', { value: host }); vi.clearAllMocks(); vi.useRealTimers(); });

describe('verified Mac S75 side-light effects', () => {
  it.each([
    ['darwin', 's75pro', 0x29, 0x24],
    ['darwin', 's75pro', 0x20, 0x20],
    ['darwin', 's75pro', 0x21, 0x21],
    ['darwin', 's75pro', 0x22, 0x21],
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

  it.each([
    ['darwin', 's75pro', 0x29, 0x24],
    ['darwin', 's75pro', 0x20, 0x20],
    ['darwin', 's75pro', 0x21, 0x21],
    ['darwin', 's75pro', 0x22, 0x21],
    ['darwin', 's75pro', 0x25, 0x21],
    ['darwin', 's75pro', 0x24, 0x21],
    ['win32', 's75pro', 0x29, 0x29],
    ['win32', 's75pro', 0x25, 0x25],
    ['linux', 's75pro', 0x29, 0x29],
    ['darwin', 'other', 0x29, 0x29],
  ] as const)('%s %s USB profile=%i sends=%i', async (platform, id, requested, actual) => {
    Object.defineProperty(process, 'platform', { value: platform });
    const d = (await Aula04Driver.attach({ ...S75PRO, id, features: { ...S75PRO.features, perkey: false } }, [
      { vendorId: 0x0c45, productId: 0x800a, release: 1, path: 'usb', interface: 0 },
    ], { log: vi.fn(), onStatus: vi.fn() }))!;
    await d.setBarLight(requested);
    expect(mocks.send).toHaveBeenCalledTimes(5);
    const payload = mocks.send.mock.calls[2][1];
    expect(payload[0]).toBe(actual);
    expect([...payload.slice(14, 16)]).toEqual([0xaa, 0x55]);
    expect([...payload.slice(1, 14), ...payload.slice(16)]).toEqual(Array(61).fill(0));
    expect(mocks.write).not.toHaveBeenCalled();
    await d.close();
  });
});

describe('receiver side-light acknowledgement', () => {
  const attach = () => Aula04Driver.attach({ ...S75PRO, features: { ...S75PRO.features, perkey: false } }, [
    { vendorId: 0x05ac, productId: 0x024f, release: 1, path: 'radio', interface: 3, usagePage: 0xff60 },
  ], { log: vi.fn(), onStatus: vi.fn() });

  it('rejects a missing side reply without another write; battery timeouts remain non-fatal after attach', async () => {
    const d = (await attach())!;
    mocks.next.mockResolvedValue(null);
    await expect(d.status()).resolves.toMatchObject({ link: '2.4g' });
    mocks.write.mockClear();
    await expect(d.setBarLight(0x20)).rejects.toThrow('SIDE_LIGHT_NO_REPLY');
    expect(mocks.write).toHaveBeenCalledOnce();
    await d.close();
  });

  it('accepts a matching reply delayed by201ms within the existing300ms window', async () => {
    const d = (await attach())!;
    vi.useFakeTimers();
    mocks.write.mockClear();
    mocks.next.mockImplementation(async () => { await new Promise(r => setTimeout(r, 201)); return Buffer.from(mocks.last); });
    const request = expect(d.setBarLight(0x21)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(201);
    await request;
    expect(mocks.write).toHaveBeenCalledOnce();
    await d.close();
  });

  it('rejects after the existing wait budget rather than treating timeout as success', async () => {
    const d = (await attach())!;
    vi.useFakeTimers();
    mocks.write.mockClear();
    mocks.next.mockImplementation(async (timeout: number) => { await new Promise(r => setTimeout(r, timeout)); return null; });
    const request = d.setBarLight(0x29).then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(300);
    expect(await request).toEqual(new Error('SIDE_LIGHT_NO_REPLY'));
    expect(mocks.write).toHaveBeenCalledOnce();
    await d.close();
  });

  it.each([[6, 1, 0], [5, 2, 0], [5, 1, 1]])('does not accept an unrelated header%s', async (...head) => {
    const d = (await attach())!;
    mocks.next.mockResolvedValueOnce(Buffer.from([...head, ...Array(29).fill(0)])).mockResolvedValueOnce(null);
    mocks.write.mockClear();
    await expect(d.setBarLight(0x20)).rejects.toThrow('SIDE_LIGHT_NO_REPLY');
    expect(mocks.write).toHaveBeenCalledOnce();
    await d.close();
  });
});
