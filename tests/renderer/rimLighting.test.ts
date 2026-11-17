import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it } from 'vitest';
import { KeyboardView } from '../../src/renderer/src/components/keyboard/KeyboardView';
import { S75PRO } from '@shared/models/s75pro';
it('preserves smoked key geometry with sampled illumination',()=>{
 const keys=S75PRO.layout!;
 const html=renderToStaticMarkup(createElement(KeyboardView,{keys,colors:{4:[255,0,170]},photo:{src:'smoked.png',width:658,height:279,x:70,y:3.5,translucent:true}}));
 expect(html).toContain('s75pro-reference-light.png');
 expect(html.match(/class="key"/g)).toHaveLength(keys.length);
 expect(html).not.toContain('<ellipse');
});
