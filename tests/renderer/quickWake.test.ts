import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  supported: true, settings: { sleep: 130, fastWake: 1 } as Record<string, number>,
  smartSupported: false, toggle: null as any, update: vi.fn(), selects: [] as any[],
}));
vi.mock('../../src/renderer/src/store', () => ({
  activeProfile: () => ({ id: 'profile', keyboard: { settings: mock.settings } }),
  useT: () => (key: string) => key,
  useTn: () => (name: string) => name,
  useStore: (select: (state: any) => unknown) => select({
    settings: {}, updateProfile: mock.update, toast: vi.fn(), call: vi.fn(), setDisplayBlackout: vi.fn(),
    deviceFor: () => ({ customSleep: true, fastWakeControl: mock.supported, smartSleepControl: mock.smartSupported }),
  }),
}));
vi.mock('../../src/renderer/src/components/ui', () => ({
  Card: ({ children }: any) => createElement('div', {}, children),
  Select: (props: any) => { mock.selects.push(props); return null; },
  Toggle: (props: any) => {
    if (props.label !== 'fastWake') return null;
    mock.toggle = props;
    return createElement('button', { disabled: props.disabled, 'aria-label': props.label, 'aria-pressed': props.on }, props.hint);
  },
}));
import { KbSettingsPanel } from '../../src/renderer/src/components/keyboard/KbSettingsPanel';

beforeEach(() => {
  mock.supported = true; mock.smartSupported = false; mock.selects = []; mock.settings = { sleep: 130, fastWake: 1 };
  mock.update.mockReset().mockImplementation((_id, fn) => fn({ keyboard: { settings: mock.settings } }));
});

it('switches deep/quick through the settings caller without changing the sleep time', () => {
  renderToStaticMarkup(createElement(KbSettingsPanel, { modelId: 's75pro' }));
  expect(mock.toggle.disabled).toBe(false);
  mock.toggle.onChange(false);
  expect(mock.settings).toEqual({ sleep: 130, fastWake: 0 });
  expect(mock.update).toHaveBeenLastCalledWith('s75pro', expect.any(Function), 'settings');
  renderToStaticMarkup(createElement(KbSettingsPanel, { modelId: 's75pro' }));
  expect(mock.toggle.on).toBe(false);
  mock.toggle.onChange(true);
  expect(mock.settings).toEqual({ sleep: 130, fastWake: 1 });
});

it('disables the switch and explains the upgrade requirement for old firmware', () => {
  mock.supported = false;
  const html = renderToStaticMarkup(createElement(KbSettingsPanel, { modelId: 's75pro' }));
  expect(mock.toggle.disabled).toBe(true);
  expect(html).toContain('fastWakeUnsupported');
  expect(mock.update).not.toHaveBeenCalled();
});

it('switches to smart mode with the initial 3/5-minute thresholds on F106', () => {
  mock.smartSupported = true;
  renderToStaticMarkup(createElement(KbSettingsPanel, { modelId: 's75pro' }));
  const mode = mock.selects.find((item) => item.label === 'sleepMode');
  expect(mode.options).toHaveLength(3);
  mode.onChange(2);
  expect(mock.settings).toEqual({ sleep: 0x82, fastWake: 2, deepSleepMinutes: 5 });
});
