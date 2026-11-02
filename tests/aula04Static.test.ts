import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ exclusive: vi.fn(async (_fn: () => Promise<unknown>) => undefined as unknown), last: new Uint8Array(32), write: vi.fn() }));
vi.mock('../src/main/hid/transport', () => ({
  HidPort: { open: async (info: {path: string}) => ({ info, path: info.path, exclusive: mocks.exclusive, close: async () => undefined,
    write: async (id: number, frame: Uint8Array) => { mocks.last.set(frame); mocks.write(id, frame); },
    flushInput: () => undefined, nextInput: async () => Buffer.from(mocks.last),
  }) },
  hasFeatureReport: async () => true, pathIface: () => 0,
  hex: () => '', sleep: async () => undefined, waitPrecise: async () => undefined,
}));
import { Aula04Driver } from '../src/main/hid/drivers/aula04Driver';
import { S75PRO } from '../src/shared/models/s75pro';
import * as P from '../src/shared/protocols/aula04';
const host = process.platform;
afterEach(() => { Object.defineProperty(process, 'platform', { value: host }); vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('S75 Pro single-colour static lighting', () => {
  it.each([
    ['darwin', 's75pro', 'usb', 1, false, true], ['win32', 's75pro', 'usb', 1, false, false],
    ['darwin', 's75pro', 'usb', 7, false, false], ['darwin', 's75pro', 'usb', 1, true, false],
    ['darwin', 's75pro', 'radio', 1, false, true], ['win32', 's75pro', 'radio', 1, false, false],
    ['linux', 's75pro', 'radio', 1, false, false], ['darwin', 'other', 'radio', 1, false, false],
    ['darwin', 's75pro', 'radio', 7, false, false], ['darwin', 's75pro', 'radio', 1, true, false],
    ['darwin', 'other', 'usb', 1, false, false],
  ] as const)('%s %s %s mode=%i colourful=%s routes to per-key=%s', async (platform, id, link, mode, colorful, custom) => {
    Object.defineProperty(process, 'platform', { value: platform });
    const device = link === 'usb' ? {vendorId:0x0c45,productId:0x800a,release:1,path:'usb',interface:0}
      : {vendorId:0x05ac,productId:0x024f,release:1,path:'radio',interface:3,usagePage:0xff60};
    const driver = await Aula04Driver.attach({ ...S75PRO, id, features: { ...S75PRO.features, perkey: false } }, [device], {log:vi.fn(),onStatus:vi.fn()});
    expect(driver).not.toBeNull();
    const perKey = vi.spyOn(driver!, 'setUserLight').mockResolvedValue(undefined);
    await driver!.setLighting({mode,color:[255,0,0],colorful,brightness:3,speed:0,direction:0});
    if (custom) {
      expect(perKey).toHaveBeenCalledWith(Object.fromEntries(S75PRO.layout!.map(k => [k.code,[255,0,0]])),3);
      expect(mocks.exclusive).not.toHaveBeenCalled();
    } else { expect(perKey).not.toHaveBeenCalled(); expect(mocks.exclusive).toHaveBeenCalledOnce(); }
    await driver!.close();
  });

  it('sends all radio static keys through the existing per-key encoder', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const driver = (await Aula04Driver.attach({ ...S75PRO, features: { ...S75PRO.features, perkey: false } }, [
      {vendorId:0x05ac,productId:0x024f,release:1,path:'radio',interface:3,usagePage:0xff60},
    ], {log:vi.fn(),onStatus:vi.fn()}))!;
    mocks.write.mockClear();
    mocks.exclusive.mockImplementationOnce(async fn => fn());
    await driver.setLighting({mode:1,color:[255,0,0],colorful:false,brightness:3,speed:3,direction:0});
    const colors = Object.fromEntries(S75PRO.layout!.map(k => [k.code,[255,0,0] as [number,number,number]]));
    const expected = [P.dongleShort(P.DONGLE_CMD.LIGHT, P.lightPayload({mode:P.USER_LIGHT_MODE,colorful:false,brightness:3,speed:0})),
      ...P.dongleBlock(P.DONGLE_CMD.USER_LIGHT, P.userLightBlock(S75PRO.layout!, colors))];
    expect(mocks.write.mock.calls.map(c => [...c[1]])).toEqual(expected.map(frame => [...frame]));
    for (const [reportId, frame] of mocks.write.mock.calls) {
      expect(reportId).toBe(0);
      expect(frame[31]).toBe([...frame.slice(0,31)].reduce((a,b) => a+b,0) & 0xff);
    }
    await driver.close();
  });
});
