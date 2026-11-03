import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ state: {} as any, power: undefined as undefined | ((state: 'on' | 'off') => void) }));
vi.mock('../../src/renderer/src/store', () => ({
  useStore: { getState: () => mocks.state, subscribe: vi.fn(), setState: vi.fn() },
  activeProfile: (s: any, id: string) => s.settings[id]?.profiles[0],
}));
vi.mock('../../src/renderer/src/audio', () => ({ acquireAudio: vi.fn(), releaseAudio: vi.fn(), watchAudioPlayback: vi.fn() }));
vi.mock('../../src/renderer/src/liveEngine', () => ({ animationSource: vi.fn(), rhythmSource: vi.fn(), startLive: vi.fn(), stopLive: vi.fn() }));
beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { aula: { platform: 'darwin', onDisplayPower: (cb: typeof mocks.power) => { mocks.power = cb; }, onMediaPlayback: vi.fn(), setMediaWatch: vi.fn() } }); });
afterEach(() => vi.unstubAllGlobals());

describe('display override side-light failure isolation', () => {
  it.each([['off', 1], ['on', 1], ['off', 0x80], ['on', 0x80]] as const)('continues main lighting after side%s fails,profile mode%i', async (failAt, mode) => {
    const lighting = { mode, brightness: 3, color: [255, 0, 0], colorful: false, speed: 3, direction: 0 };
    const keyboard = { lighting, perKey: { 4: [255, 0, 0] }, barMode: 0x20 };
    const call = vi.fn(async (_id: string, method: string, value: unknown) => {
      if (method === 'setBarLight' && value === (failAt === 'off' ? 0x29 : 0x20)) throw new Error('SIDE_LIGHT_NO_REPLY');
    });
    mocks.state = { devices: [{ modelId: 's75pro', key: 's75pro:2.4g' }], deviceFor: () => ({ link: '2.4g' }), settings: { s75pro: { profiles: [{ keyboard }], displayBlackout: true } }, call, toast: vi.fn(), t: (key: string) => key };
    const overrides = await import('../../src/renderer/src/overrides');
    overrides.registerOverrides();
    mocks.power!('off');
    await vi.waitFor(() => expect(call).toHaveBeenCalledWith('s75pro', 'setUserLight', {}, 1));
    expect(overrides.isBarOverridden('s75pro')).toBe(true);
    mocks.power!('on');
    await vi.waitFor(() => mode === 0x80
      ? expect(call).toHaveBeenCalledWith('s75pro', 'setUserLight', keyboard.perKey, 3)
      : expect(call).toHaveBeenCalledWith('s75pro', 'setLighting', lighting));
    expect(overrides.isBarOverridden('s75pro')).toBe(false);
    expect(call.mock.calls.filter(c => c[1] === 'setBarLight')).toHaveLength(2);
    expect(call.mock.calls.map(c => c[1])).toEqual(['setBarLight', 'setUserLight', 'setBarLight', mode === 0x80 ? 'setUserLight' : 'setLighting']);
  });
});
