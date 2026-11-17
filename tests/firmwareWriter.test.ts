import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const filename = resolve('resources/firmware/stock-flash.cjs');
const require = createRequire(filename);
const context = {
  module: { exports: {} as ReturnType<typeof require> }, Buffer, __dirname: dirname(filename),
  // This checks packets, not elapsed device pacing; Windows rounds short timers up.
  require: (id: string) => id === 'node:timers/promises' ? { setTimeout: async () => undefined } : require(id),
};
runInNewContext(readFileSync(filename, 'utf8'), context, { filename });
const writer = context.module.exports;
const image = readFileSync(resolve('resources/firmware/S75Pro-F106.bin'));
const target = { vendorId: 0x0c45, productId: 0x800a, product: 'AULA-S75Pro', usagePage: 0xff13, usage: 1, path: 'test' };

it('streams the reviewed F106 image and checks both device checksums', async () => {
  let last: number | string = 0;
  let chunks = 0;
  let programming = false;
  let programmed = false;
  const stream: Buffer[] = [];
  const ops: (number | string)[] = [];
  const hid = {
    devices: () => [target],
    HID: class {
      sendFeatureReport(raw: number[]) {
        const b = Buffer.from(raw);
        if (programming) {
          stream.push(b.subarray(1));
          if (++chunks === 4096) { programming = false; programmed = true; }
          return 65;
        }
        if (b.subarray(1, 9).equals(Buffer.from('aa42895aff7162cc', 'hex'))) { ops.push('entry'); return 65; }
        if (b[1] === 4 && b[2] === 0xf5) { last = 'normal'; ops.push(last); return 65; }
        if (b[1] === 4 && b[2] === 2) { ops.push('end'); return 65; }
        last = b[1]; ops.push(last);
        return 65;
      }
      getFeatureReport() {
        const b = Buffer.alloc(65);
        if (last === 'normal') { b[1] = 4; b[2] = 0xf5; b[4] = 1; return [...b]; }
        b[1] = Number(last); b[2] = 0xaa; b[3] = 0x55; b.writeUInt32LE(0xfafafafa, 5);
        if (last === 1) { b[9] = 32; b[10] = 5; b.writeUInt16LE(0xffff, 13); b.writeUInt16LE(0x5a5a, 15); }
        if (last === 5 && !programmed) programming = true;
        if ((last === 5 && programmed) || last === 6) {
          b.writeUInt16LE(0x025f, 9);
          image.copy(b, 61, image.length - 4);
        }
        return [...b];
      }
      close() {}
    },
  };
  const result = await writer.flashFirmware(hid, image);
  expect(result.status).toBe('candidate_flash_verified');
  expect(result.firmwareVerified).toBe(true);
  expect(result.normalProtocolVerified).toBe(true);
  expect(chunks).toBe(4096);
  expect(Buffer.concat(stream)).toEqual(image);
  expect(ops).toEqual(['entry', 1, 2, 4, 5, 6, 3, 7, 'normal', 'end']);
}, 30000);
