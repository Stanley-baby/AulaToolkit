import { afterEach, expect, it, vi } from 'vitest';
const media=vi.hoisted(()=>({decodeImage:vi.fn(async()=>[{bitmap:{width:135,height:240,close:vi.fn()},delayMs:50}]),drawKeyAnimation:vi.fn()}));
vi.mock('../../src/renderer/src/media',()=>media);
vi.mock('../../src/renderer/src/store',()=>({useStore:{}}));
import { animationSource } from '../../src/renderer/src/liveEngine';
afterEach(()=>vi.unstubAllGlobals());
it('includes direction in the decoded key-frame cache but treats missing rotation as zero',async()=>{
  const libraryGet=vi.fn(async()=>'data:image/gif;base64,fixture');
  vi.stubGlobal('window',{aula:{libraryGet}});
  vi.stubGlobal('OffscreenCanvas',class {
    getContext(){return {getImageData:(_x:number,_y:number,w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4).fill(255)})};}
  });
  const base={enabled:true,libraryId:'rotation-cache-test',name:'test',mode:'fit' as const,speed:1,brightness:100};
  expect(await animationSource('s75pro',base)).not.toBeNull();
  expect(await animationSource('s75pro',{...base,rotation:0})).not.toBeNull();
  expect(media.decodeImage).toHaveBeenCalledTimes(1);
  for(const rotation of [90,180,270] as const) {
    await animationSource('s75pro',{...base,rotation});
    expect(media.drawKeyAnimation.mock.calls.at(-1)?.[5]).toBe(rotation);
  }
  expect(media.decodeImage).toHaveBeenCalledTimes(4);
  await animationSource('s75pro',{...base,rotation:90});
  expect(media.decodeImage).toHaveBeenCalledTimes(4);
});
