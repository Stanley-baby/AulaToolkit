import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
// Static rendering must read the current fixture, not Zustand's initial SSR snapshot.
vi.mock('zustand', async (load) => {
  const actual = await load<typeof import('zustand')>();
  return {...actual, create: (init: any) => { const store=actual.create(init);return Object.assign((selector: any)=>selector(store.getState()),store); }};
});
vi.mock('../../src/renderer/src/apply', () => ({ schedule: vi.fn() }));
vi.mock('../../src/renderer/src/theme', () => ({ applyTheme: vi.fn(), initTheme: vi.fn() }));
import { useStore } from '../../src/renderer/src/store';
import { LightingPanel } from '../../src/renderer/src/components/keyboard/LightingPanel';
import { newProfile } from '@shared/defaults';
import { S75PRO } from '@shared/models/s75pro';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { aula: { platform: 'darwin' } });
  useStore.setState({
    prefs:{...useStore.getState().prefs,language:'en'}, selectedModel: 's75pro', devices: [{key:'s75pro:usb',modelId:'s75pro',link:'usb',productName:'test',battery:null,charging:false}],
    liveLight: {}, settings: {s75pro:{profiles:[newProfile(S75PRO,'Default')],activeProfile:'',macros:[],
      music:{enabled:true,mode:17,speed:3},
      keyAnimation:{enabled:true,libraryId:'',name:'',mode:'cover',speed:1,brightness:100}}},
  });
  const f=useStore.getState().settings.s75pro;
  f.activeProfile=f.profiles[0].id;
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('does not claim an animation with no asset is playing', () => {
  const html=renderToStaticMarkup(createElement(LightingPanel,{modelId:'s75pro'}));
  expect(html).not.toContain('The animation on the keys is playing.');
  expect(html).not.toContain('按键动画播放中');
});
it('shows the enabled animation switch even before a library item is chosen', () => {
  useStore.setState({prefs:{...useStore.getState().prefs,language:'en'}});
  const html=renderToStaticMarkup(createElement(LightingPanel,{modelId:'s75pro'}));
  const start=html.indexOf('Plays a picture or GIF');
  const fragment=html.slice(start,start+800);
  expect(start).toBeGreaterThan(-1);
  expect(fragment).toContain('aria-pressed="true"');
});
it('enabling animation gives it priority over music', () => {
  const a=useStore.getState().settings.s75pro.keyAnimation!;
  useStore.getState().setKeyAnimation('s75pro',{...a,enabled:true,libraryId:'gif'});
  expect(useStore.getState().settings.s75pro.music?.enabled).toBe(false);
});
it('enabling music stops the key animation', () => {
  const m=useStore.getState().settings.s75pro.music!;
  useStore.getState().setMusic('s75pro',{...m,enabled:true});
  expect(useStore.getState().settings.s75pro.keyAnimation?.enabled).toBe(false);
});
it('manually selecting an effect stops competing automatic lighting', () => {
  useStore.getState().updateProfile('s75pro',p=>{p.keyboard!.lighting.mode=10;},'lighting');
  const f=useStore.getState().settings.s75pro;
  expect(f.keyAnimation?.enabled).toBe(false);
  expect(f.music?.enabled).toBe(false);
});
it('readback updates do not disable explicitly enabled automatic lighting', () => {
  useStore.getState().updateProfile('s75pro',p=>{p.keyboard!.lighting.brightness=4;},null);
  const f=useStore.getState().settings.s75pro;
  expect(f.keyAnimation?.enabled).toBe(true);
  expect(f.music?.enabled).toBe(true);
});

it('shows the original direction for an older profile with no rotation field',()=>{
  const html=renderToStaticMarkup(createElement(LightingPanel,{modelId:'s75pro'}));
  expect(html).toContain('Direction');
  expect(html).toContain('0° ↑');
});
it('saves rotation together with the existing animation settings',async()=>{
  useStore.setState({prefs:{...useStore.getState().prefs,knownDevices:['s75pro']}});
  const save=vi.fn(async(_id:string,_file:unknown)=>undefined);
  vi.stubGlobal('window',{aula:{platform:'darwin',saveSettings:save}});
  const original=useStore.getState().settings.s75pro.keyAnimation!;
  useStore.getState().setKeyAnimation('s75pro',{...original,libraryId:'gif',rotation:90});
  await vi.advanceTimersByTimeAsync(1200);
  expect(save).toHaveBeenCalled();
  const file=save.mock.calls.at(-1)![1] as any;
  expect(file.keyAnimation).toMatchObject({...original,libraryId:'gif',rotation:90});
});

it('defaults to average colours and displays an explicitly disabled setting',()=>{
  let html=renderToStaticMarkup(createElement(LightingPanel,{modelId:'s75pro'}));
  let start=html.indexOf('Average colours');
  expect(start).toBeGreaterThan(-1);
  expect(html.slice(start,start+600)).toContain('aria-pressed="true"');
  const original=useStore.getState().settings.s75pro.keyAnimation!;
  useStore.getState().setKeyAnimation('s75pro',{...original,averageColor:false});
  html=renderToStaticMarkup(createElement(LightingPanel,{modelId:'s75pro'}));
  start=html.indexOf('Average colours');
  expect(html.slice(start,start+600)).toContain('aria-pressed="false"');
});
it('saves disabled averaging alongside rotation and the selected asset',async()=>{
  useStore.setState({prefs:{...useStore.getState().prefs,knownDevices:['s75pro']}});
  const save=vi.fn(async(_id:string,_file:unknown)=>undefined);
  vi.stubGlobal('window',{aula:{platform:'darwin',saveSettings:save}});
  const original=useStore.getState().settings.s75pro.keyAnimation!;
  useStore.getState().setKeyAnimation('s75pro',{...original,libraryId:'gif',rotation:90,averageColor:false});
  await vi.advanceTimersByTimeAsync(1200);
  const file=save.mock.calls.at(-1)![1] as any;
  expect(file.keyAnimation).toMatchObject({...original,libraryId:'gif',rotation:90,averageColor:false});
});

it('provides a separate breathing switch defaulting off for older per-key profiles', () => {
  useStore.getState().updateProfile('s75pro', p => { p.keyboard!.lighting.mode = 0x80; }, null);
  const html = renderToStaticMarkup(createElement(LightingPanel, { modelId: 's75pro' }));
  const start = html.indexOf('Breathing effect');
  expect(start).toBeGreaterThan(-1);
  expect(html.slice(start, start + 650)).toContain('aria-pressed="false"');
});
it('saves the breathing flag per profile without changing colors or disabling an animation', async () => {
  const before = structuredClone(useStore.getState().settings.s75pro.profiles[0].keyboard!.perKey);
  const save = vi.fn(async () => undefined);
  vi.stubGlobal('window', { aula: { platform: 'darwin', saveSettings: save } });
  useStore.setState({ prefs: { ...useStore.getState().prefs, knownDevices: ['s75pro'] } });
  useStore.getState().updateProfile('s75pro', p => { p.keyboard!.perKeyBreathing = true; }, null);
  await vi.advanceTimersByTimeAsync(1200);
  const file = useStore.getState().settings.s75pro;
  expect(file.profiles[0].keyboard!.perKeyBreathing).toBe(true);
  expect(file.profiles[0].keyboard!.perKey).toEqual(before);
  expect(file.keyAnimation!.enabled).toBe(true);
  expect(save).toHaveBeenCalled();
});
it('renders acknowledged breathing brightness without auto-exposure cancelling the dim phase', () => {
  useStore.getState().updateProfile('s75pro', p => { p.keyboard!.lighting.mode = 0x80; p.keyboard!.perKeyBreathing = true; }, null);
  useStore.setState({ liveLight: { s75pro: { colors: { 4: [20, 0, 0] }, at: 1000, source: 'breathing' } } });
  const html = renderToStaticMarkup(createElement(LightingPanel, { modelId: 's75pro' }));
  expect(html).toMatch(/data-reference-key="4"[^>]*fill="rgb\(20,0,0\)"/);
});
