import { afterEach, describe, expect, it, vi } from 'vitest';
import * as media from '../../src/renderer/src/media';
afterEach(()=>vi.unstubAllGlobals());
const bitmap={width:135,height:240} as ImageBitmap;
function canvas() {
  return {save:vi.fn(),restore:vi.fn(),translate:vi.fn(),rotate:vi.fn(),fillRect:vi.fn(),drawImage:vi.fn(),fillStyle:'',imageSmoothingQuality:''};
}
describe('key animation rotation before cover/fit',()=>{
  it.each([0,90,180,270] as const)('rotates %i degrees around the output centre and restores the context',rotation=>{
    const ctx=canvas();
    media.drawKeyAnimation(ctx as any,bitmap,192,75,'fit',rotation);
    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.translate.mock.calls[0]).toEqual([96,37.5]);
    expect(ctx.rotate).toHaveBeenCalledWith(rotation*Math.PI/180);
    const swapped=rotation===90||rotation===270;
    expect(ctx.translate.mock.calls[1]).toEqual(swapped?[-37.5,-96]:[-96,-37.5]);
    expect(ctx.fillRect).toHaveBeenCalledWith(0,0,swapped?75:192,swapped?192:75);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
  it('keeps an old profile with no rotation equivalent to zero degrees',()=>{
    const ctx=canvas();
    media.drawKeyAnimation(ctx as any,bitmap,192,75,'fit');
    expect(ctx.rotate).toHaveBeenCalledWith(0);
    expect(ctx.drawImage.mock.calls[0][3]).toBeCloseTo(42.1875);
    expect(ctx.drawImage.mock.calls[0][4]).toBeCloseTo(75);
  });
  it('fits the rotated portrait across substantially more keys without stretching it',()=>{
    const ctx=canvas();
    media.drawKeyAnimation(ctx as any,bitmap,192,75,'fit',90);
    const [image,x,y,width,height]=ctx.drawImage.mock.calls[0];
    expect(image).toBe(bitmap);
    expect(x).toBeCloseTo(0);expect(y).toBeCloseTo(29.333333);
    expect(width).toBeCloseTo(75);expect(height).toBeCloseTo(133.333333);
    // After rotation: about133/192 of the width instead of42/192.
    expect(height/192).toBeGreaterThan(.69);
  });
  it('covers the output after rotation, with centred crop rather than side bars',()=>{
    const ctx=canvas();
    media.drawKeyAnimation(ctx as any,bitmap,192,75,'cover',270);
    expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([-16.5,0,108,192]);
  });
  it('restores the transform if drawing fails',()=>{
    const ctx=canvas();ctx.drawImage.mockImplementation(()=>{throw Error('draw failed');});
    expect(()=>media.drawKeyAnimation(ctx as any,bitmap,192,75,'fit',90)).toThrow('draw failed');
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});
