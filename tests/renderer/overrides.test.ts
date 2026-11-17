import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ state: {} as any, power: undefined as undefined | ((state: 'on' | 'off') => void) }));
vi.mock('../../src/renderer/src/store', () => ({
  useStore: { getState: () => mocks.state, subscribe: vi.fn(), setState: vi.fn() },
  activeProfile: (s: any, id: string) => s.settings[id]?.profiles[0],
}));
vi.mock('../../src/renderer/src/audio', () => ({ acquireAudio: vi.fn(), releaseAudio: vi.fn(), watchAudioPlayback: vi.fn() }));
vi.mock('../../src/renderer/src/liveEngine', () => ({ animationSource: vi.fn(), breathingSource: vi.fn(() => () => ({})), rhythmSource: vi.fn(), startLive: vi.fn(), stopLive: vi.fn() }));
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

it('clears a failed animation override so normal effects can be applied again', async () => {
  const lighting={mode:1,color:[255,0,0],brightness:3,speed:3,direction:0,colorful:false};
  mocks.state={devices:[{modelId:'s75pro',key:'s75pro:usb'}],deviceFor:()=>({link:'usb'}),
    settings:{s75pro:{profiles:[{keyboard:{lighting,perKey:{}}}],keyAnimation:{enabled:true,libraryId:'bad'}}},
    call:vi.fn(async()=>undefined),toast:vi.fn(),t:(key:string)=>key};
  const live=await import('../../src/renderer/src/liveEngine');
  vi.mocked(live.animationSource).mockRejectedValueOnce(new Error('invalid GIF'));
  const overrides=await import('../../src/renderer/src/overrides');
  overrides.registerOverrides();
  await vi.waitFor(()=>expect(mocks.state.toast).toHaveBeenCalledWith('errGeneric','error'));
  expect(overrides.isOverridden('s75pro')).toBe(false);
  expect(mocks.state.call).toHaveBeenCalledWith('s75pro','setLighting',lighting);
});

it('keeps the previous animation running until replacement frames are ready',async()=>{
  vi.clearAllMocks();
  const lighting={mode:1,color:[255,0,0],brightness:3,speed:3,direction:0,colorful:false};
  const animation={enabled:true,libraryId:'gif',averageColor:true};
  const oldState:any={devices:[{modelId:'s75pro',key:'s75pro:usb'}],deviceFor:()=>({link:'usb'}),
    settings:{s75pro:{profiles:[{keyboard:{lighting,perKey:{}}}],keyAnimation:animation}},
    call:vi.fn(async()=>undefined),toast:vi.fn(),t:(key:string)=>key};
  mocks.state=oldState;
  const live=await import('../../src/renderer/src/liveEngine');
  const first=()=>({});const second=()=>({});
  vi.mocked(live.animationSource).mockResolvedValueOnce(first);
  const overrides=await import('../../src/renderer/src/overrides');
  const store=await import('../../src/renderer/src/store');
  overrides.registerOverrides();
  await vi.waitFor(()=>expect(live.startLive).toHaveBeenCalledWith('s75pro',first,'animation'));
  let resolve!: (source:typeof second)=>void;
  vi.mocked(live.animationSource).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  mocks.state={...oldState,settings:{s75pro:{...oldState.settings.s75pro,keyAnimation:{...animation,averageColor:false}}}};
  vi.mocked(store.useStore.subscribe).mock.calls.at(-1)![0](mocks.state,oldState);
  await vi.waitFor(()=>expect(live.animationSource).toHaveBeenCalledTimes(2));
  expect(live.stopLive).not.toHaveBeenCalled();
  expect(overrides.isOverridden('s75pro')).toBe(true);
  resolve(second);
  await vi.waitFor(()=>expect(live.startLive).toHaveBeenCalledWith('s75pro',second,'animation'));
  expect(live.stopLive).toHaveBeenCalledTimes(1);
});

async function breathingSetup(link = 'usb', enabled = true) {
  vi.clearAllMocks();
  const keyboard = { lighting: { mode: 0x80, brightness: 4, color: [255, 0, 0], colorful: false, speed: 3, direction: 0 }, perKey: { 4: [255, 0, 0] }, perKeyBreathing: enabled, barMode: 0x20 };
  mocks.state = { devices: [{ modelId: 's75pro', key: `s75pro:${link}` }], deviceFor: () => ({ link }),
    settings: { s75pro: { profiles: [{ keyboard }] } }, call: vi.fn(async () => undefined), toast: vi.fn(), t: (key: string) => key };
  const overrides = await import('../../src/renderer/src/overrides');
  const live = await import('../../src/renderer/src/liveEngine');
  const store = await import('../../src/renderer/src/store');
  const change = (patch: Record<string, unknown>) => {
    const prev = mocks.state;
    mocks.state = { ...prev, settings: { s75pro: { ...prev.settings.s75pro, profiles: [{ keyboard: { ...prev.settings.s75pro.profiles[0].keyboard, ...patch } }] } } };
    vi.mocked(store.useStore.subscribe).mock.calls.at(-1)![0](mocks.state, prev);
  };
  return { overrides, live, change, keyboard };
}
it('breathes over USB, keeps phase while colors change, and restores steady colors on switch-off', async () => {
  const { overrides, live, change } = await breathingSetup();
  overrides.registerOverrides();
  await vi.waitFor(() => expect(live.startLive).toHaveBeenCalledWith('s75pro', expect.any(Function), 'breathing'));
  expect(overrides.isOverridden('s75pro')).toBe(true);
  change({ perKey: { 5: [0, 255, 0] } });
  await new Promise(r => setTimeout(r, 0));
  expect(live.startLive).toHaveBeenCalledTimes(1);
  change({ perKeyBreathing: false });
  await vi.waitFor(() => expect(mocks.state.call).toHaveBeenCalledWith('s75pro', 'setUserLight', { 5: [0, 255, 0] }, 4));
  expect(live.stopLive).toHaveBeenCalledTimes(1);
  expect(overrides.isOverridden('s75pro')).toBe(false);
});
it.each([['2.4g', true], ['usb', false]])('does not stream on %s when breathing enabled=%s', async (link, on) => {
  const { overrides, live } = await breathingSetup(link as string, on as boolean);
  overrides.registerOverrides();
  await new Promise(r => setTimeout(r, 0));
  expect(live.startLive).not.toHaveBeenCalled();
  expect(overrides.isOverridden('s75pro')).toBe(false);
});
it('stops breathing when another lighting mode is selected', async () => {
  const { overrides, live, change, keyboard } = await breathingSetup();
  overrides.registerOverrides();
  await vi.waitFor(() => expect(live.startLive).toHaveBeenCalled());
  const lighting = { ...keyboard.lighting, mode: 7 };
  change({ lighting });
  await vi.waitFor(() => expect(mocks.state.call).toHaveBeenCalledWith('s75pro', 'setLighting', lighting));
  expect(live.stopLive).toHaveBeenCalledTimes(1);
});
it('display blackout stops breathing and resumes it on wake without changing the saved colors', async () => {
  const { overrides, live, keyboard } = await breathingSetup();
  overrides.registerOverrides();
  await vi.waitFor(() => expect(live.startLive).toHaveBeenCalledTimes(1));
  mocks.power!('off');
  await vi.waitFor(() => expect(mocks.state.call).toHaveBeenCalledWith('s75pro', 'setUserLight', {}, 1));
  expect(live.stopLive).toHaveBeenCalledTimes(1);
  mocks.power!('on');
  await vi.waitFor(() => expect(live.startLive).toHaveBeenCalledTimes(2));
  expect(keyboard.perKey).toEqual({ 4: [255, 0, 0] });
});
it('an enabled key animation takes priority over breathing', async () => {
  const { overrides, live } = await breathingSetup();
  mocks.state.settings.s75pro.keyAnimation = { enabled: true, libraryId: 'gif' };
  vi.mocked(live.animationSource).mockResolvedValueOnce(() => ({}));
  overrides.registerOverrides();
  await vi.waitFor(() => expect(live.startLive).toHaveBeenCalledWith('s75pro', expect.any(Function), 'animation'));
  expect(live.breathingSource).not.toHaveBeenCalled();
});
