import { describe, expect, it } from 'vitest';
import * as P from '@shared/protocols/g5kb';
import { F75_KEYS, F75_EXTRA } from '@shared/models/f75.layout';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

describe('g5kb framing', () => {
  it('builds the vendor header', () => {
    const h = P.header(P.CMD.LED, 0, 1, 0, 2);
    expect(h.length).toBe(0x208);
    expect(hex(h.subarray(0, 8))).toBe('06 04 00 00 01 00 02 00');
  });
  it('splits writes into 512-byte packets', () => {
    const pk = P.writePackets(P.CMD.MATRIX, 1, new Uint8Array(600));
    expect(pk.length).toBe(2);
    expect(pk[1][4]).toBe(2); expect(pk[1][5]).toBe(1);
    expect(pk[1][6] | (pk[1][7] << 8)).toBe(88);
  });
});

describe('g5kb matrix', () => {
  it('writes factory defaults for every key and ends with the signature', () => {
    const m = P.matrixBlock(F75_KEYS, {}, new Map(), 128, F75_EXTRA);
    expect(m.length).toBe(512);
    const esc = F75_KEYS.find((k) => k.name === 'Esc')!;
    expect(hex(m.subarray(esc.idx * 4, esc.idx * 4 + 4))).toBe('00 00 29 00');
    const fn = F75_KEYS.find((k) => k.name === 'FN')!;
    expect(hex(m.subarray(fn.idx * 4, fn.idx * 4 + 4))).toBe('0d 00 00 00');
    expect(hex(m.subarray(84 * 4, 84 * 4 + 4))).toBe('07 00 00 1d');
    expect(hex(m.subarray(508))).toBe('00 00 5a a5');
  });
  it('encodes remaps and macros', () => {
    expect(P.encodeKey({ type: 'key', code: 0x04, mods: 0x01 })).toEqual([0, 1, 4, 0]);
    expect(P.encodeKey({ type: 'media', usage: 0xcd })).toEqual([2, 0, 0, 0xcd]);
    expect(P.encodeKey({ type: 'mouse', id: 4 })).toEqual([1, 1, 2, 0]);
    const esc = F75_KEYS.find((k) => k.name === 'Esc')!;
    const m = P.matrixBlock(F75_KEYS, { [esc.code]: { type: 'macro', index: 3, mode: 0, loops: 2 } }, new Map([[3, 0]]));
    expect(hex(m.subarray(esc.idx * 4, esc.idx * 4 + 4))).toBe('03 01 02 00');
  });
});

describe('g5kb lighting page', () => {
  const effects = [{ mode: 1, hw: 1 }, { mode: 2, hw: 3 }];
  const page = (): Uint8Array => { const p = new Uint8Array(0x80); p.set(P.SIGNATURE, 0x7e); return p; };
  it('patches the active effect and its slot', () => {
    const { page: out, slot } = P.patchLed(page(), effects, { mode: 2, color: [255, 0, 0], colorful: true, brightness: 9, speed: 4, direction: 0 });
    expect(slot).toBe(1);
    expect(out[10]).toBe(3);
    expect(out[0x3a + 2]).toBe(9);
    expect(out[0x3b + 2]).toBe(0x47);
  });
  it('round-trips through the decoder', () => {
    const { page: out } = P.patchLed(page(), effects, { mode: 1, color: [10, 20, 30], colorful: false, brightness: 5, speed: 2, direction: 0 });
    const tab = P.patchRgbTab(new Uint8Array(0x200), 0, [10, 20, 30]);
    expect(P.decodeLed(out, tab, effects)).toEqual({ mode: 1, brightness: 5, speed: 2, colorful: false, color: [10, 20, 30], direction: 0 });
  });
});

describe('g5kb macros', () => {
  it('packs name and events', () => {
    const b = P.macroBlock([{ id: 'a', name: 'Hi', steps: [{ kind: 'KEY_DOWN', code: 4 }, { kind: 'delay', ms: 50 }, { kind: 'KEY_UP', code: 4 }] }], [0]);
    expect(hex(b.subarray(0, 4))).toBe('04 00 0d 00');
    expect(hex(b.subarray(4))).toBe('04 48 00 69 00 10 00 32 04 90 00 00 04'); // name length is in bytes (UTF-16LE)
  });
});
