import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ open: vi.fn(), feature: vi.fn() }));
vi.mock('../src/main/hid/transport', () => ({
  HidPort: { open: mock.open }, hasFeatureReport: mock.feature,
  pathIface: (d: { interface: number }) => d.interface,
  hex: () => '', sleep: async () => undefined, waitPrecise: async () => undefined,
}));
import { Aula04Driver } from '../src/main/hid/drivers/aula04Driver';
import { S75PRO } from '../src/shared/models/s75pro';

const devices = [
  { vendorId: 0x0c45, productId: 0x800a, release: 1, path: 'alternate', interface: 3, usagePage: 0xff13 },
  { vendorId: 0x0c45, productId: 0x800a, release: 1, path: 'control', interface: 0, usagePage: 1 },
];
beforeEach(() => {
  vi.clearAllMocks();
  mock.open.mockImplementation(async (info) => ({ info, path: info.path, close: async () => undefined }));
  mock.feature.mockResolvedValue(true);
});
describe('S75 Pro HID collection selection', () => {
  it('prefers the model-declared control interface when two collections answer feature reads', async () => {
    const driver = await Aula04Driver.attach({ ...S75PRO, features: { ...S75PRO.features, perkey: false } }, devices, { log: vi.fn(), onStatus: vi.fn() });
    expect(driver?.paths).toEqual(['control']);
    await driver?.close();
  });
  it('keeps probing other collections when the declared interface does not answer', async () => {
    mock.feature.mockImplementation(async (info) => info.path === 'alternate');
    const driver = await Aula04Driver.attach({ ...S75PRO, features: { ...S75PRO.features, perkey: false } }, devices, { log: vi.fn(), onStatus: vi.fn() });
    expect(driver?.paths).toEqual(['alternate']);
    await driver?.close();
  });
});
