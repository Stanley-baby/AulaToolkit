import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { TitleBar } from '../../src/renderer/src/components/TitleBar';
vi.mock('../../src/renderer/src/store', () => ({
  useT: () => (key: string) => key,
  useStore: (selector: (state: any) => unknown) => selector({ page: 'home', setPage: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());
it.each(['darwin', 'win32'])('%s uses the correct window controls', (platform) => {
  vi.stubGlobal('window', { aula: { platform } });
  const html = renderToStaticMarkup(createElement(TitleBar));
  expect(html.includes('title="minimize"')).toBe(platform !== 'darwin');
  expect(html.includes('title="close"')).toBe(platform !== 'darwin');
  expect(html).toContain('title="rescan"');
  expect(html).toContain('title="settings"');
  if (platform === 'darwin') expect(html).toContain('padding-left:88px');
});
