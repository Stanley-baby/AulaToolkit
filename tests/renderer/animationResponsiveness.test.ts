import { afterEach, expect, it, vi } from 'vitest';
const media=vi.hoisted(()=>({decodeImage:vi.fn(async()=>Array.from({length:16},()=>({bitmap:{close:vi.fn()},delayMs:80}))),drawKeyAnimation:vi.fn()}));
vi.mock('../../src/renderer/src/media',()=>media);
vi.mock('../../src/renderer/src/store',()=>({useStore:{}}));
import { animationSource } from '../../src/renderer/src/liveEngine';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('lets pending UI work run while preparing a multi-frame animation',async()=>{
  vi.stubGlobal('window',{aula:{libraryGet:async()=>'data:image/gif;base64,fixture'}});
  vi.stubGlobal('OffscreenCanvas',class {
    getContext(){return {getImageData:(_x:number,_y:number,w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)})};}
  });
  let clock=0;
  vi.spyOn(performance,'now').mockImplementation(()=>clock+=4);
  let uiRan=false;const timer=setTimeout(()=>{uiRan=true;},0);
  try {
    const source=await animationSource('s75pro',{enabled:true,libraryId:'responsiveness-test',name:'test',mode:'cover',speed:1,brightness:100,averageColor:false});
    expect(source).not.toBeNull();
    expect(uiRan,'UI timer must run before the full frame batch finishes').toBe(true);
  } finally {clearTimeout(timer);}
});
