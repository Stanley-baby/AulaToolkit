import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { KeyboardView } from '../../src/renderer/src/components/keyboard/KeyboardView';
import { S75PRO } from '@shared/models/s75pro';
const render = (barMode: number) => renderToStaticMarkup(createElement(KeyboardView, {
  keys: S75PRO.layout!, colors: {}, barMode,
  photo: { src: 'board.png', x: 70, y: 3.5, width: 658, height: 279, translucent: true },
} as any));
it.each([[0x20, 's75-side-flow'], [0x21, 's75-side-cycle'], [0x22, 'data-side-static']])('body side mode %s selects its own preview', (mode, expected) => {
  const html = render(mode as number);
  expect(html).toContain(expected);
  expect(html).toContain('s75-slot-flow'); // End slot remains independent.
});
it('off covers the baked-in side lights without hiding the independent End slot', () => {
  const html = render(0x29);
  expect(html).toContain('data-side-blackout');
  expect(html).not.toContain('class="s75-side-flow"');
  expect(html).not.toContain('class="s75-side-cycle"');
  expect(html).not.toContain('data-side-static');
  expect(html).toContain('s75-slot-flow');
});
it('receives the saved bar setting from LightingPanel and supports reduced motion', () => {
  const panel = readFileSync(new URL('../../src/renderer/src/components/keyboard/LightingPanel.tsx', import.meta.url), 'utf8');
  expect(panel).toContain('barMode={kb.barMode}');
  const css = readFileSync(new URL('../../src/renderer/src/styles.css', import.meta.url), 'utf8');
  expect(css).toContain('.s75-side-flow, .s75-side-cycle');
});
