import { describe, expect, it } from 'vitest';
import * as P from '@shared/protocols/aula04';
import { S75PRO } from '@shared/models/s75pro';
import { S75PRO_KEYS } from '@shared/models/s75pro.layout';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

describe('aula04 USB framing', () => {
  it('places the side-light marker at bytes 14/15, as in vendor FUN_00433fd0', () => {
    const p = P.barPayload(0x23);
    expect(p.length).toBe(64);
    expect(p[0]).toBe(0x23);
    expect([...p.subarray(14, 16)]).toEqual([0xaa, 0x55]);
    expect([...p.subarray(16)]).toEqual(Array(48).fill(0));
  });

  it('keeps all ten vendor side-light modes in language-ID order', () => {
    expect(S75PRO.barModes?.map(m => m.mode)).toEqual(Array.from({length:10}, (_,i) => 0x20+i));
    expect(S75PRO.barModes?.find(m => m.name === 'Blue')?.mode).toBe(0x25);
    expect(S75PRO.barModes?.find(m => m.name === 'Off')?.mode).toBe(0x29);
  });

  it('builds a control command with the packet count', () => {
    const c = P.command(P.OP.KEYMAP, 0, 9);
    expect(hex(c.subarray(0, 10))).toBe('04 11 00 00 00 00 00 00 09 00');
    expect(c.length).toBe(64);
  });

  it('builds a lighting payload ending with AA 55', () => {
    const p = P.lightPayload({ mode: 7, color: [255, 0, 128], colorful: false, brightness: 4, speed: 2, direction: 1 });
    expect(hex(p.subarray(0, 12))).toBe('07 ff 00 80 00 00 00 00 00 04 02 01');
    expect(p[62]).toBe(0xaa); expect(p[63]).toBe(0x55);
  });

  it('encodes key actions', () => {
    expect(P.encodeKeyAction({ type: 'key', code: 0x04, mods: 0x01 })).toEqual([0x02, 0x01, 0x04, 0]);
    expect(P.encodeKeyAction({ type: 'key', code: 0xe1, mods: 0 })).toEqual([0x02, 0x02, 0, 0]);
    expect(P.encodeKeyAction({ type: 'mouse', id: 6 })).toEqual([0x01, 0x03, 0xff, 0]);
    expect(P.encodeKeyAction({ type: 'media', usage: 0x192 })).toEqual([0x03, 0x92, 0x01, 0]);
    expect(P.encodeKeyAction({ type: 'macro', index: 2, mode: 1, loops: 3 })).toEqual([0x06, 2, 1, 3]);
    expect(P.encodeKeyAction({ type: 'disable' })).toEqual([0x05, 0x03, 0, 0]);
    expect(P.encodeKeyAction({ type: 'default' })).toBeNull();
  });

  it('places keymap entries at idx*4 in a 576-byte block', () => {
    const esc = S75PRO_KEYS.find((k) => k.name === 'Esc')!;
    const block = P.keymapBlock(S75PRO_KEYS, { [esc.code]: { type: 'key', code: 0x29, mods: 0 } });
    expect(block.length).toBe(0x240);
    expect(hex(block.subarray(esc.idx * 4, esc.idx * 4 + 4))).toBe('02 00 29 00');
    expect(block[0x23e]).toBe(0xaa);
  });

  it('round-trips per-key colours', () => {
    const colors = { [S75PRO_KEYS[0].code]: [1, 2, 3] as [number, number, number] };
    const block = P.userLightBlock(S75PRO_KEYS, colors);
    expect(P.decodeUserLightBlock(S75PRO_KEYS, block)[S75PRO_KEYS[0].code]).toEqual([1, 2, 3]);
  });

  it('packs live frames like the vendor driver', () => {
    const k = S75PRO_KEYS.find((x) => x.light === 0x27)!;
    const block = P.liveLightBlock(S75PRO_KEYS, { [k.code]: [0xff, 0x00, 0x7f] });
    expect(block.length).toBe(512);
    // captured from the vendor driver (Music Rhythm, S75 Pro)
    expect(hex(block.subarray(0, 64))).toBe('01 00 00 00 02 00 00 00 03 00 00 00 04 00 00 00 05 00 00 00 06 00 00 00 07 00 00 00 08 00 00 00 09 00 00 00 0a 00 00 00 0b 00 00 00 0c 00 00 00 0d 00 00 00 77 00 00 00 13 00 00 00 14 00 00 00');
    expect(hex(block.subarray(124, 128))).toBe('27 ff 00 7f');
    expect(block.subarray(80 * 4).every((b) => b === 0)).toBe(true);
  });

  it('lays out macros with a 400-byte offset table', () => {
    const { data, packets } = P.macroBlock([{ id: 'a', name: 'a', steps: [{ kind: 'KEY_DOWN', code: 0x04 }, { kind: 'delay', ms: 50 }, { kind: 'KEY_UP', code: 0x04 }] }]);
    expect(hex(data.subarray(0, 4))).toBe('90 01 00 00');
    expect(hex(data.subarray(400, 420))).toBe('03 00 00 00 00 00 00 00 00 00 04 b0 32 00 00 50 00 00 04 30');
    // 420 bytes used -> 6 full packets + 2 (remainder + terminator)
    expect(packets).toBe(8);
    expect(data.length).toBe(packets * 64);
    expect(data[data.length - 2]).toBe(0xaa);
  });

  it('frames dongle packets with a checksum', () => {
    const f = P.dongleFrame(0x20, 0x01, 0);
    expect(f.length).toBe(32);
    expect(f[31]).toBe((0x20 + 0x01) & 0xff);
    const blocks = P.dongleBlock(0x10, new Uint8Array(0x240));
    expect(blocks.length).toBe(21);
    expect(blocks[20][1]).toBe(0x10);
  });

  it('builds a screen image header and pads to 4096', () => {
    const s = { width: 135, height: 240, headLength: 256, chunk: 4096 };
    const px = new Uint8Array(135 * 240 * 2);
    const { data, chunks } = P.screenImage([{ pixels: px, delayMs: 100 }], s);
    expect(data[0]).toBe(1); expect(data[1]).toBe(50);
    expect(chunks).toBe(Math.ceil((256 + px.length) / 4096));
    expect(data.length % 4096).toBe(0);
  });

  it('converts RGBA to RGB565 little-endian', () => {
    const out = P.rgb565(Uint8Array.from([255, 0, 0, 255]), 1, 1);
    expect(hex(out)).toBe('00 f8');
  });
});
