import { afterEach, expect, it, vi } from 'vitest';
import { sampleKeys, type KeyCell } from '@shared/liveLighting';
const media=vi.hoisted(()=>({decodeImage:vi.fn(async()=>[{bitmap:{close:vi.fn()},delayMs:80}]),drawKeyAnimation:vi.fn()}));
vi.mock('../../src/renderer/src/media',()=>media);
vi.mock('../../src/renderer/src/store',()=>({useStore:{}}));
import { animationSource } from '../../src/renderer/src/liveEngine';
afterEach(()=>vi.unstubAllGlobals());
const cell:KeyCell={code:1,col:0,row:0,u0:0,v0:0,u1:1,v1:1};
it('keeps averaging as the default and samples only the centre when disabled, with brightness',()=>{
  const rgba=new Uint8ClampedArray(3*3*4);rgba.set([240,120,60,255],4*4);
  expect(sampleKeys([cell],rgba,3,3,.5)[1]).toEqual([13,7,3]);
  expect(sampleKeys([cell],rgba,3,3,.5,true)[1]).toEqual([13,7,3]);
  expect(sampleKeys([cell],rgba,3,3,.5,false)[1]).toEqual([120,60,30]);
});
it('clamps centre sampling to the last pixel at the right and bottom edges',()=>{
  const rgba=new Uint8ClampedArray(2*3*4);rgba.set([12,34,56,255],5*4);
  expect(sampleKeys([{...cell,u0:1,v0:1}],rgba,2,3,1,false)[1]).toEqual([12,34,56]);
});
it('separates cache entries and disables image smoothing only for centre sampling',async()=>{
  const libraryGet=vi.fn(async()=>'data:image/gif;base64,fixture');
  vi.stubGlobal('window',{aula:{libraryGet}});
  const contexts:any[]=[];
  vi.stubGlobal('OffscreenCanvas',class {
    getContext(){const ctx={imageSmoothingEnabled:true,getImageData:(_x:number,_y:number,w:number,h:number)=>{
      const data=new Uint8ClampedArray(w*h*4);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set([x%2?240:0,0,0,255],(y*w+x)*4);
      return {data};
    }};contexts.push(ctx);return ctx;}
  });
  const base={enabled:true,libraryId:'sampling-cache-test',name:'test',mode:'cover' as const,speed:1,brightness:100};
  const average=await animationSource('s75pro',base);
  const explicit=await animationSource('s75pro',{...base,averageColor:true});
  expect(libraryGet).toHaveBeenCalledTimes(1);
  const centre=await animationSource('s75pro',{...base,averageColor:false});
  expect(libraryGet).toHaveBeenCalledTimes(2);
  expect(contexts.map(c=>c.imageSmoothingEnabled)).toEqual([true,false]);
  expect(centre!(0)).not.toEqual(average!(0));
  expect(explicit!(0)).toEqual(average!(0));
  await animationSource('s75pro',{...base,averageColor:true});
  expect(libraryGet).toHaveBeenCalledTimes(2);
});
