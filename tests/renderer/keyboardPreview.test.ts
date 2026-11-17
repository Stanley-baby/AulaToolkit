import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { KeyboardView } from '../../src/renderer/src/components/keyboard/KeyboardView';
import { S75PRO } from '@shared/models/s75pro';

const keys = S75PRO.layout!;
const colors = Object.fromEntries(keys.map((key, i) => [key.code, [40 + i, 150, 200] as [number, number, number]]));
const render = () => renderToStaticMarkup(createElement(KeyboardView, {
  keys, colors, photo: { src: 'keyboard.png', width: 800, height: 300 }, onKey: () => undefined,
}));

it('blurs the whole animated photo lighting layer once, not once per key', () => {
  const html = render();
  expect(html.match(/filter="url\(#kblur\)"/g)).toHaveLength(1);
});

it('blends photo lighting in two layers rather than creating two blend layers per key', () => {
  const html = render();
  expect(html.match(/mix-blend-mode:screen/g)).toHaveLength(1);
  expect(html.match(/mix-blend-mode:multiply/g)).toHaveLength(1);
});

it('preserves every key light, cap tint, opaque-cap mask and interactive key target', () => {
  const html = render();
  expect(html.match(/<ellipse /g)).toHaveLength(keys.length);
  expect(html.match(/<linearGradient /g)).toHaveLength(keys.length);
  expect(html.match(/class="key"/g)).toHaveLength(keys.length);
  expect(html.match(/fill="#000"/g)).toHaveLength(keys.length);
  expect(html).toContain('href="keyboard.png"');
  for (const c of Object.values(colors)) expect(html).toContain(`rgb(${c[0]},${c[1]},${c[2]})`);
});
