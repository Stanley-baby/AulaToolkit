import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const fixture = vi.hoisted(() => ({ color: [255, 0, 200] }));
vi.mock('../../src/renderer/src/store', () => ({
  useT: () => (s: string) => s, useTn: () => (s: string) => s,
  activeProfile: () => ({ keyboard: { lighting: { mode: 17, color: fixture.color, brightness: 5, speed: 1, colorful: false }, perKey: {}, barMode: 0x21 } }),
  useStore: (select: (s: any) => unknown) => select({ deviceFor: () => ({ link: '2.4g', battery: 50 }), settings: {}, prefs: { batteryStats: false }, bluetooth: {}, liveLight: {} }),
}));
vi.mock('../../src/renderer/src/liveEngine', () => ({ MUSIC_DEFAULTS: {} }));
vi.mock('../../src/renderer/src/effects', () => ({ useEffectPreview: () => ({ 4: fixture.color }) }));
vi.mock('../../src/renderer/src/components/BatteryCard', () => ({ BatteryCard: () => null }));
vi.mock('../../src/renderer/src/components/LibraryGrid', () => ({ LibraryGrid: () => null }));
import { Overview } from '../../src/renderer/src/components/Overview';
import { LightingPanel } from '../../src/renderer/src/components/keyboard/LightingPanel';
import { KeyboardView } from '../../src/renderer/src/components/keyboard/KeyboardView';
import { S75PRO } from '@shared/models/s75pro';
import { S75_SMOKED_PHOTO } from '../../src/renderer/src/assets';
afterEach(() => vi.unstubAllGlobals());
it('S75 overview retains original light image and adds a theme-controlled smoked image', () => {
  const html = renderToStaticMarkup(createElement(Overview, { modelId: 's75pro' }));
  expect(html).toContain('s75-overview-light');
  expect(html).toContain('s75-overview-dark');
  expect(html).toContain('s75pro-smoked.png');
  const css = readFileSync(new URL('../../src/renderer/src/styles.css', import.meta.url), 'utf8');
  expect(css).toContain("[data-theme='dark'] .s75-overview-light");
  expect(css).toContain("[data-theme='dark'] .s75-overview-dark");
});
it('other models keep their existing overview image', () => {
  const html = renderToStaticMarkup(createElement(Overview, { modelId: 'f75' }));
  expect(html).not.toContain('s75-overview-');
});
it.each(['darwin', 'win32'])('S75 lighting uses the smoked image regardless of platform/theme: %s', (platform) => {
  vi.stubGlobal('window', { aula: { platform } });
  const html = renderToStaticMarkup(createElement(LightingPanel, { modelId: 's75pro' }));
  expect(html).toContain('s75pro-smoked.png');
  expect(html).toContain('x="70"');
  expect(html).not.toContain('mix-blend-mode:multiply');
  expect(html).toContain('data-reference-light');
});
it('smoked caps transmit LED light and retain all interactive targets', () => {
  const keys = S75PRO.layout!;
  const html = renderToStaticMarkup(createElement(KeyboardView, { keys, colors: { 4: [255, 0, 200] }, photo: { src: 'smoked.png', width: 658, height: 279, x: 70, y: 4, translucent: true } } as any));
  expect(html.match(/fill="#000"/g)).toHaveLength(keys.length);
  expect(html).toContain('s75pro-reference-light.png');
  expect(html.match(/mix-blend-mode:screen/g)).toHaveLength(1);
  expect(html.match(/class="key"/g)).toHaveLength(keys.length);
  expect(html).toContain('href="smoked.png" x="70" y="4"');
});

it('clips the approved photo to its case without removing the LED or interaction layers', () => {
  const html = renderToStaticMarkup(createElement(KeyboardView, {
    keys: S75PRO.layout!, colors: { 4: [255, 0, 0] }, photo: S75_SMOKED_PHOTO,
  }));
  expect(html).toContain('data-case-outline="true"');
  expect(html).toMatch(/<g clip-path="url\(#kcase-[^)]+\)">/);
  expect(html).toContain('scale(658 279)');
  expect(html).toContain('s75-side-flow');
  expect(html).toContain('s75-slot-flow');
  expect(html.match(/class="key"/g)).toHaveLength(S75PRO.layout!.length);
});
it('uses the same case outline for the dark overview and leaves other photos unchanged', () => {
  const overview = renderToStaticMarkup(createElement(Overview, { modelId: 's75pro' }));
  expect(overview).toContain('data-case-outline="true"');
  expect(overview).toContain('clipPathUnits="objectBoundingBox"');
  const other = renderToStaticMarkup(createElement(KeyboardView, {
    keys: S75PRO.layout!, photo: { src: 'original.png', width: 800, height: 300 },
  }));
  expect(other).not.toContain('data-case-outline="true"');
  expect(other).not.toContain('clip-path="url(#kcase-');
});
