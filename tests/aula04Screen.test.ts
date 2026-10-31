import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({reply:vi.fn(),write:vi.fn(),send:vi.fn(),log:vi.fn(),progress:vi.fn()}));
vi.mock('../src/main/hid/transport',()=>({
  HidPort:{open:async(info:{path:string})=>({info,path:info.path,close:async()=>undefined,exclusive:async(fn:()=>Promise<unknown>)=>fn(),sendFeature:mocks.send,getFeature:async()=>Buffer.alloc(65),write:mocks.write,flushInput:()=>undefined,nextInput:mocks.reply})},
  hasFeatureReport:async(info:{path:string})=>info.path==='main',pathIface:(d:{interface:number})=>d.interface,
  hex:()=>'',sleep:async()=>undefined,waitPrecise:async()=>undefined,
}));
import { Aula04Driver } from '../src/main/hid/drivers/aula04Driver';
import { S75PRO } from '../src/shared/models/s75pro';
const frame={pixels:new Uint8Array(135*240*2),delayMs:500};
async function driver(){return (await Aula04Driver.attach({...S75PRO,features:{...S75PRO.features,perkey:false}},[
 {vendorId:0xc45,productId:0x800a,release:1,path:'main',interface:0},
 {vendorId:0xc45,productId:0x800a,release:1,path:'screen',interface:2,usagePage:0xff68},
],{log:mocks.log,onStatus:vi.fn(),onProgress:mocks.progress}))!;}
beforeEach(()=>{vi.resetAllMocks();mocks.reply.mockResolvedValue(Buffer.from([1]));mocks.write.mockResolvedValue(undefined);});
describe('S75 screen transfer completion',()=>{
 it('rejects a missing acknowledgement without announcing completion, and ends the transfer',async()=>{
  mocks.reply.mockResolvedValue(null);const d=await driver();
  await expect(d.uploadScreen([frame])).rejects.toThrow('Screen transfer timed out at chunk 1/');
  expect(mocks.reply).toHaveBeenCalledOnce();expect(mocks.log.mock.calls.some(c=>String(c[1]).includes('screen upload done'))).toBe(false);
  expect(mocks.send.mock.calls.some(c=>c[1][0]===4&&c[1][1]===2)).toBe(true);await d.close();
 });
 it('announces completion only after every chunk has an acknowledgement',async()=>{
  const d=await driver();await d.uploadScreen([frame]);
  expect(mocks.reply.mock.calls.length).toBeGreaterThan(1);expect(mocks.log.mock.calls.some(c=>String(c[1]).includes('screen upload done'))).toBe(true);await d.close();
 });
 it('ends the transfer when a screen data write fails',async()=>{
  mocks.write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('screen disconnected'));const d=await driver();
  await expect(d.uploadScreen([frame])).rejects.toThrow('screen disconnected');
  expect(mocks.send.mock.calls.some(c=>c[1][0]===4&&c[1][1]===2)).toBe(true);await d.close();
 });
});
