import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ ready: false }));
vi.mock('../../src/renderer/src/store', () => ({ useStore: (select: (s: any) => unknown) => select({init:()=>{},page:'home',toasts:[],devices:[],prefs:{onboarded:true},ready:mock.ready,setupModel:null}) }));
vi.mock('../../src/renderer/src/components/TitleBar', () => ({ TitleBar: () => 'TITLE' }));
vi.mock('../../src/renderer/src/components/Sidebar', () => ({ Sidebar: () => 'SIDEBAR' }));
vi.mock('../../src/renderer/src/components/DevicePage', () => ({ DevicePage: () => 'DEVICE' }));
vi.mock('../../src/renderer/src/components/AppSettings', () => ({ AppSettings: () => 'SETTINGS' }));
vi.mock('../../src/renderer/src/components/Home', () => ({ Home: () => 'HOME' }));
vi.mock('../../src/renderer/src/components/VendorWarning', () => ({ VendorWarning: () => null }));
vi.mock('../../src/renderer/src/components/Onboarding', () => ({ Onboarding: () => null }));
vi.mock('../../src/renderer/src/components/DeviceSetup', () => ({ DeviceSetup: () => null }));
vi.mock('../../src/renderer/src/apply', () => ({ pullFromDevice: vi.fn() }));
vi.mock('../../src/renderer/src/bridges', () => ({ registerBridges: vi.fn() }));
import App from '../../src/renderer/src/App';
it('does not paint default-language content while preferences are loading', () => {
  mock.ready = false;
  expect(renderToStaticMarkup(createElement(App))).toBe('');
});
it('renders the main interface once preferences and theme are ready', () => {
  mock.ready = true;
  const html = renderToStaticMarkup(createElement(App));
  expect(html).toContain('SIDEBAR'); expect(html).toContain('HOME');
});
