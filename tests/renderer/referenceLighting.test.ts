import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { KeyboardView } from '../../src/renderer/src/components/keyboard/KeyboardView';
import { S75PRO } from '@shared/models/s75pro';
const keys = S75PRO.layout!;
const render = (color: [number, number, number]) => renderToStaticMarkup(createElement(KeyboardView, {keys, colors:Object.fromEntries(keys.map(k=>[k.code,color])),photo:{src:'board.png',x:70,y:3.5,width:658,height:279,translucent:true}}));
it('uses the reference light texture for every key instead of constructed rim paths', () => {
 const html=render([255,0,0]);
 expect(html).toContain('s75pro-reference-light.png');
 expect(html).toContain('data-reference-light');
 expect(html).not.toContain('<radialGradient');
 expect(html.match(/data-reference-key=/g)).toHaveLength(keys.length);
});
it('animates only the End-adjacent slot and supports reduced motion', () => {
 const html=render([0,0,0]);
 expect(html).toContain('s75-slot-flow');
 expect(html).toContain('x="657.2"');
 const css=readFileSync(new URL('../../src/renderer/src/styles.css',import.meta.url),'utf8');
 expect(css).toContain('@keyframes s75-slot-flow');
 expect(css).toContain('prefers-reduced-motion: reduce');
});
it('preserves key interaction and zero-colour light output',()=>{
 const html=render([0,0,0]);
 expect(html.match(/class="key"/g)).toHaveLength(keys.length);
 expect(html.match(/data-reference-key="[^"]+"[^>]*fill="rgb\(0,0,0\)"/g)).toHaveLength(keys.length);
});
