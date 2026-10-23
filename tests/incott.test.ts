import { describe, expect, it } from 'vitest';
import * as P from '@shared/protocols/incott';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
const frame = (...b: number[]): Uint8Array => Uint8Array.from([...b, ...new Array(64 - b.length).fill(0)]);

describe('incott encoders', () => {
  it('writes DPI as (dpi/50 - 1) little-endian with an axis byte', () => {
    expect(hex(P.setDpiStage(2, 25000))).toBe('09 0c 02 f3 01 00 00 00 00');
    expect(hex(P.setDpiStage(0, 800, 1))).toBe('09 0c 00 0f 00 00 00 00 01');
    expect(() => P.setDpiStage(0, 833)).toThrow();
  });
  it('selects the active stage without touching values', () => {
    expect(hex(P.setDpiCycle(6, 3))).toBe('09 0b 06 03 00 01 01 00 00');
    expect(hex(P.setDpiCycle(4, 1, 2, [1, 1]))).toBe('09 0b 04 01 02 01 01 00 00');
  });
  it('maps polling rates to wire values', () => {
    expect(hex(P.setPolling(8000))).toBe('09 0d 04 00 00 00 00 00 00');
    expect(hex(P.setPolling(1000))).toBe('09 0d 00 00 00 00 00 00 00');
  });
  it('encodes sensor and timing settings', () => {
    expect(hex(P.setLiftOff(7))).toBe('09 0a 01 02 00 00 00 00 00');
    expect(hex(P.setToggle(P.SUB.MOTION_SYNC, true))).toBe('09 0a 04 01 00 00 00 00 00');
    expect(hex(P.setPerformance(2))).toBe('09 0a 05 02 00 00 00 00 00');
    expect(hex(P.setSleep(300))).toBe('09 09 03 2c 01 00 00 00 00');
    expect(hex(P.setFireKey(3, 10))).toBe('09 09 02 03 0a 00 00 00 00');
  });
  it('encodes button actions as 32-bit words', () => {
    expect(P.encodeButton({ type: 'dpi', op: 'cycle' }, 0)).toBe(0x00030007);
    expect(P.encodeButton({ type: 'key', code: 0x04, mods: 0 }, 0)).toBe(0x00000480);
    expect(P.encodeButton({ type: 'key', code: 0x04, mods: 0x01 }, 0)).toBe(0x00040100);
    expect(P.encodeButton({ type: 'media', usage: 0xcd }, 0)).toBe(0x00cd0003);
    expect(P.encodeButton({ type: 'macro', index: 3, mode: 0 }, 0)).toBe(0x00030009);
    expect(hex(P.setButton(5, 0x00030007))).toBe('09 06 05 07 00 03 00 00 00');
  });
  it('decodes button words back to actions', () => {
    expect(P.decodeButton(0x00f00001)).toEqual({ type: 'mouse', id: 1 });
    expect(P.decodeButton(0x00000480)).toEqual({ type: 'key', code: 4, mods: 0 });
    expect(P.decodeButton(0x00040100)).toEqual({ type: 'key', code: 4, mods: 1 });
    expect(P.decodeButton(0x00cd0003)).toEqual({ type: 'media', usage: 0xcd });
    expect(P.decodeButton(0x00030009)).toEqual({ type: 'macro', index: 3, mode: 0 });
  });
});

describe('incott decoders', () => {
  it('matches latched frames on command and sub-command', () => {
    // Frames captured from a real SC900 Pro: stage 5 = 0x207 -> 26000, cycle 06 03 00 01 01, polling 00 -> 1000 Hz
    expect(P.decodeDpiStage(frame(0x09, 0x8c, 0x05, 0x07, 0x02), 5)).toBe(26000);
    expect(P.decodeDpiStage(frame(0x09, 0x8c, 0x01, 0x0f, 0x00), 2)).toBeNull();
    expect(P.decodeDpiCycle(frame(0x09, 0x8b, 0x06, 0x03, 0x00, 0x01, 0x01))).toEqual({ count: 6, active: 3, ledEffect: 0, extra: [1, 1] });
    expect(P.decodePolling(frame(0x09, 0x8d, 0x00, 0x08))).toBe(1000);
    expect(P.decodeLiftOff(frame(0x09, 0x8a, 0x01, 0x02))).toBe(7);
    expect(P.decodeDebounce(frame(0x09, 0x89, 0x01, 0x08))).toBe(8);
    expect(P.decodeFireKey(frame(0x09, 0x89, 0x02, 0x03, 0x0a))).toEqual({ times: 3, intervalMs: 10 });
    expect(P.decodeSleep(frame(0x09, 0x89, 0x03, 0x3c, 0x00))).toBe(60);
    expect(P.decodeButtonCode(frame(0x09, 0x86, 0x05, 0x07, 0x00, 0x03, 0x00), 5)).toBe(0x00030007);
  });
  it('decodes the AULA SC900 Pro identity frame', () => {
    const id = P.decodeIdentity(frame(0x09, 0x8f, 0x03, 0x0c, 0x02, 0xf0, 0xf0, 0x00))!;
    expect(id.modelCode).toBe(0x0c);
    expect(id.receiver8k).toBe(true);
    expect(id.sensor).toBe('PAW3395');
  });
  it('decodes unsolicited battery reports', () => {
    expect(P.decodeInputStatus(0x5f, 0x10)).toEqual({ battery: 95, charging: false, dpiStage: 1, pollingIndex: 0 });
    expect(P.decodeInputStatus(0xe1, 0x10)).toEqual({ battery: 97, charging: true, dpiStage: 1, pollingIndex: 0 });
  });
});

describe('incott macros', () => {
  it('builds the 320-byte buffer pinned to the vendor capture layout', () => {
    const buf = P.macroBuffer(0, [{ key: 0x04, press: true, delayMs: 50 }, { key: 0x04, press: false, delayMs: 0 }], 2, 1, 7);
    expect(hex(buf.subarray(0, 12))).toBe('00 02 01 00 01 04 32 00 81 04 00 00');
    expect(Buffer.from(buf.subarray(288, 294)).toString()).toBe('Macro1');
    expect(buf[304]).toBe((2 + 1) * 4 + 128);
    expect(buf[318]).toBe(2);
    expect(P.macroChunks(buf).length).toBe(10);
    expect(hex(P.macroChunkHeader(3, 0))).toBe('09 07 0a 03 20 00 00 00 00');
  });
  it('folds delay steps into the preceding event', () => {
    const s = P.toIncottSteps([{ kind: 'KEY_DOWN', code: 5 }, { kind: 'delay', ms: 30 }, { kind: 'delay', ms: 20 }, { kind: 'KEY_UP', code: 5 }]);
    expect(s).toEqual([{ key: 5, press: true, delayMs: 50 }, { key: 5, press: false, delayMs: 0 }]);
  });
});
