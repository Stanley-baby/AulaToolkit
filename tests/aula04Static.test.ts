import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ exclusive: vi.fn(async () => undefined) }));
vi.mock('../src/main/hid/transport', () => ({
  HidPort: { open: async (info: {path: string}) => ({ info, path: info.path, exclusive: mocks.exclusive, close: async () => undefined }) },
  hasFeatureReport: async () => true, pathIface: () => 0,
  hex: () => '', sleep: async () => undefined, waitPrecise: async () => undefined,
}));
import { Aula04Driver } from '../src/main/hid/drivers/aula04Driver';
import { S75PRO } from '../src/shared/models/s75pro';
const host = process.platform;
afterEach(() => { Object.defineProperty(process, 'platform', { value: host }); vi.restoreAllMocks(); vi.clearAllMocks(); });
describe('S75 Pro single-colour static lighting', () => {
  it.each([
    ['darwin', 1, false, true], ['win32', 1, false, false],
    ['darwin', 7, false, false], ['darwin', 1, true, false],
  ] as const)('%s mode=%i colourful=%s routes to per-key=%s', async (platform, mode, colorful, custom) => {
    Object.defineProperty(process, 'platform', { value: platform });
    const driver = await Aula04Driver.attach({ ...S75PRO, features: { ...S75PRO.features, perkey: false } }, [{vendorId:0x0c45,productId:0x800a,release:1,path:'usb',interface:0}], {log:vi.fn(),onStatus:vi.fn()});
    expect(driver).not.toBeNull();
    const perKey = vi.spyOn(driver!, 'setUserLight').mockResolvedValue(undefined);
    await driver!.setLighting({mode,color:[255,0,0],colorful,brightness:3,speed:0,direction:0});
    if (custom) {
      expect(perKey).toHaveBeenCalledWith(Object.fromEntries(S75PRO.layout!.map(k => [k.code,[255,0,0]])),3);
      expect(mocks.exclusive).not.toHaveBeenCalled();
    } else { expect(perKey).not.toHaveBeenCalled(); expect(mocks.exclusive).toHaveBeenCalledOnce(); }
    await driver!.close();
  });
});
