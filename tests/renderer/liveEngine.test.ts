import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(()=>({state:{liveLight:{}} as any}));
vi.mock('../../src/renderer/src/store',()=>({activeProfile:(s:any,id:string)=>s.settings?.[id]?.profiles[0],useStore:{getState:()=>fixture.state,setState:(fn:any)=>Object.assign(fixture.state,fn(fixture.state))}}));
import { breathingSource, startLive, stopLive } from '../../src/renderer/src/liveEngine';
beforeEach(()=>{
  vi.useFakeTimers();
  fixture.state={liveLight:{},deviceFor:()=>({key:'s75pro:usb',link:'usb'})};
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it.each(['animation','rhythm'] as const)('marks %s only after an accepted frame', async(kind)=>{
  let accept!:(taken:boolean)=>void;
  const call=vi.fn(()=>new Promise<boolean>(r=>{accept=r;}));
  vi.stubGlobal('window',{aula:{call}});
  const colors={4:[255,0,0] as [number,number,number]};
  startLive('s75pro',()=>colors,kind);
  expect(fixture.state.liveLight.s75pro).toBeUndefined();
  accept(true);await Promise.resolve();await Promise.resolve();
  expect(fixture.state.liveLight.s75pro).toMatchObject({colors,source:kind});
  const done=stopLive('s75pro');await vi.runOnlyPendingTimersAsync();await done;
});
it('does not claim playback after a busy/skipped hardware frame', async()=>{
  vi.stubGlobal('window',{aula:{call:vi.fn(async()=>false)}});
  startLive('s75pro',()=>({}),'animation');await Promise.resolve();await Promise.resolve();
  expect(fixture.state.liveLight.s75pro).toBeUndefined();
  const done=stopLive('s75pro');await vi.runOnlyPendingTimersAsync();await done;
});

it('samples current colors and brightness without restarting the breathing phase', () => {
  const keyboard = { perKey: { 4: [255, 0, 0] }, lighting: { brightness: 5 } };
  fixture.state.settings = { s75pro: { profiles: [{ keyboard }] } };
  const now = vi.spyOn(performance, 'now').mockReturnValue(100);
  const source = breathingSource('s75pro');
  expect(source(100)).toEqual({ 4: [255, 0, 0] });
  keyboard.perKey = { 4: [0, 120, 240] };
  expect(source(850)).toEqual({ 4: [0, 60, 120] });
  keyboard.lighting.brightness = 1;
  expect(source(3100)).toEqual({ 4: [0, 24, 48] });
  now.mockRestore();
});
it('sends the steady fallback to main and publishes breathing only after an accepted frame', async () => {
  const keyboard = { perKey: { 4: [255, 0, 0] }, lighting: { brightness: 3 } };
  fixture.state.settings = { s75pro: { profiles: [{ keyboard }] } };
  const call = vi.fn(async () => true);
  vi.stubGlobal('window', { aula: { call } });
  startLive('s75pro', () => ({ 4: [64, 0, 0] }), 'breathing');
  await Promise.resolve(); await Promise.resolve();
  expect(call).toHaveBeenCalledWith('s75pro:usb', 'setLiveLight', { 4: [64, 0, 0] }, { colors: keyboard.perKey, brightness: 3 });
  expect(fixture.state.liveLight.s75pro.source).toBe('breathing');
  const done = stopLive('s75pro'); await vi.runOnlyPendingTimersAsync(); await done;
});
