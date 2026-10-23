// SinoWealth "BYCOMBO4" keyboard protocol (vendor class CDevG5KB) used by the AULA F75 family.
// Pure encoders; transport lives in src/main/hid/drivers/g5kbDriver.ts.
//
// Every transfer is a 520-byte feature report (report id 6):
//   06 <cmd> <sub> 00 <total packets> <packet idx> <len lo> <len hi> <payload up to 512>
// Reads send the header with cmd | 0x80 and then GET_FEATURE the same id.
// Protocol knowledge: reverse-engineered from OemDrv.exe by the open-aula and AulaSofwareLinux projects
// and verified on F75 hardware there.

import type { KeyAction, LightingState, Macro } from '../types';
import { isModifier, modifierBit } from '../keycodes';

export const REPORT_ID = 6;
export const REPORT_SIZE = 0x208; // including the report id
export const CHUNK = 0x200;
export const LED_SIZE = 0x80;
export const RGB_TAB_SIZE = 0x200;
export const SIGNATURE = [0x5a, 0xa5] as const;
export const CMD = { MATRIX: 0x03, LED: 0x04, MACRO: 0x05, COLOR_GROUP: 0x06, RGB_TAB: 0x0a, RESET: 0x11, INFO: 0x02, POWER: 0x07 } as const;
export const READ = 0x80;
export const MACRO_PLAY_MODES = ['Repeat N times', 'Repeat while held', 'Repeat until any key'];
const MACRO_MODE = [1, 2, 4];

/** Fixed effect colours the firmware knows; index 7 = let the firmware cycle colours. */
export const COLORS: [number, number, number][] = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
export const COLOR_RANDOM = 7;

export interface G5Key { code: number; idx: number; def: number[] }

export function header(cmd: number, sub: number, total: number, idx: number, size: number): Uint8Array {
  const b = new Uint8Array(REPORT_SIZE);
  b[0] = REPORT_ID; b[1] = cmd; b[2] = sub; b[3] = 0;
  b[4] = total; b[5] = idx; b[6] = size & 0xff; b[7] = size >> 8;
  return b;
}

export function writePackets(cmd: number, sub: number, data: Uint8Array): Uint8Array[] {
  const total = Math.max(1, Math.ceil(data.length / CHUNK));
  const out: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    const part = data.subarray(i * CHUNK, (i + 1) * CHUNK);
    const p = header(cmd, sub, total, i, part.length);
    p.set(part, 8);
    out.push(p);
  }
  return out;
}

/** 4-byte matrix entry: `00 mods hid 00` key, `02 00 usageHi usageLo` consumer, `01 btn 01 00` mouse. */
export function encodeKey(a: KeyAction | undefined): number[] | null {
  switch (a?.type) {
    case 'disable': return [0, 0, 0, 0];
    case 'key': {
      if (isModifier(a.code)) return [0, (a.mods & 0xff) | modifierBit(a.code), 0, 0];
      return [0, a.mods & 0xff, a.code & 0xff, 0];
    }
    case 'media': return [2, 0, (a.usage >> 8) & 0xff, a.usage & 0xff];
    case 'mouse': {
      const btn = ({ 1: 1, 2: 3, 3: 2, 7: 4, 8: 5 } as Record<number, number>)[a.id];
      if (btn) return [1, btn, 1, 0];
      return ({ 4: [1, 1, 2, 0], 5: [1, 8, 0, 0], 6: [1, 9, 0, 0] } as Record<number, number[]>)[a.id] ?? null;
    }
    default: return null;
  }
}

/** Builds one layer's matrix. Unset slots mean "no function", so every key's factory entry is written first. */
export function matrixBlock(keys: G5Key[], actions: Record<number, KeyAction>, macroIds: Map<number, number>, matrixLen = 128, extra: { idx: number; def: number[] }[] = []): Uint8Array {
  const buf = new Uint8Array(matrixLen * 4);
  for (const d of [...keys, ...extra]) buf.set(d.def, d.idx * 4);
  for (const k of keys) {
    const a = actions[k.code];
    let bytes: number[] | null;
    if (a?.type === 'macro') {
      const id = macroIds.get(a.index);
      if (id == null) continue;
      bytes = [3, MACRO_MODE[a.mode] ?? 1, a.mode === 0 ? Math.max(1, a.loops ?? 1) : 1, id];
    } else {
      bytes = encodeKey(a);
    }
    if (bytes) buf.set(bytes, k.idx * 4);
  }
  buf.set([0, 0, ...SIGNATURE], buf.length - 4);
  return buf;
}

// ---- Macros: table of (u16 addr, u16 size) then bodies: name-length, UTF-16LE name, 4-byte events ----
export function macroEvents(steps: Macro['steps']): number[][] {
  const ev: { type: number; up: boolean; code: number; delay: number }[] = [];
  for (const s of steps) {
    if (s.kind === 'delay') { if (ev.length) ev[ev.length - 1].delay += s.ms ?? 0; continue; }
    const mouse = s.kind.startsWith('MOUSE');
    const code = mouse ? ({ 1: 1, 2: 2, 4: 4 } as Record<number, number>)[s.code ?? 1] ?? 1 : (s.code ?? 0);
    ev.push({ type: mouse ? 2 : 1, up: s.kind.endsWith('UP'), code, delay: 0 });
  }
  return ev.map((e) => {
    const d = Math.min(0xfffff, e.delay);
    return [(e.type << 4) | ((d >> 16) & 0x0f) | (e.up ? 0x80 : 0), (d >> 8) & 0xff, d & 0xff, e.code];
  });
}

export function macroBlock(macros: Macro[], used: number[]): Uint8Array {
  const bodies = used.map((i) => {
    const m = macros[i];
    const name = Array.from((m?.name ?? '').slice(0, 30)).flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8]);
    return Uint8Array.from([name.length, ...name, ...macroEvents(m?.steps ?? []).flat()]);
  });
  const table = bodies.length * 4;
  const out = new Uint8Array(table + bodies.reduce((n, b) => n + b.length, 0));
  let addr = table;
  bodies.forEach((b, i) => {
    out.set([addr & 0xff, addr >> 8, b.length & 0xff, b.length >> 8], i * 4);
    out.set(b, addr);
    addr += b.length;
  });
  return out;
}

export const checkSignature = (buf: Uint8Array, at: number): boolean => buf[at] === SIGNATURE[0] && buf[at + 1] === SIGNATURE[1];

export const nearestColor = (c: [number, number, number]): number => {
  let best = 0, bestD = Infinity;
  COLORS.forEach((k, i) => { const d = (c[0] - k[0]) ** 2 + (c[1] - k[1]) ** 2 + (c[2] - k[2]) ** 2; if (d < bestD) { bestD = d; best = i; } });
  return best;
};

/**
 * Patches the 128-byte LED/config page (read-modify-write): byte 10 = active hardware effect,
 * per-effect slot i: 0x3a+2i brightness (0-9), 0x3b+2i = speed<<4 | colour index (7 = cycle).
 * The custom colour goes into colour slot 0 of the effect's row in the RGB table.
 */
export function patchLed(page: Uint8Array, effects: { mode: number; hw: number }[], l: LightingState): { page: Uint8Array; slot: number } {
  const slot = effects.findIndex((e) => e.mode === l.mode);
  if (slot < 0) throw new Error(`Unknown effect ${l.mode}`);
  const out = Uint8Array.from(page);
  out[10] = effects[slot].hw;
  out[0x3a + slot * 2] = Math.max(0, Math.min(9, l.brightness));
  out[0x3b + slot * 2] = ((Math.max(0, Math.min(4, l.speed)) & 0x0f) << 4) | (l.colorful ? COLOR_RANDOM : 0);
  return { page: out, slot };
}

export function patchRgbTab(tab: Uint8Array, slot: number, c: [number, number, number]): Uint8Array {
  const out = Uint8Array.from(tab);
  out.set(c, 21 * (slot + 1));
  out.set(SIGNATURE, 0x1fa);
  return out;
}

/** Decodes the page's live effect into our lighting state shape (colour comes from the RGB table). */
export function decodeLed(page: Uint8Array, tab: Uint8Array | null, effects: { mode: number; hw: number }[]): Partial<LightingState> | null {
  if (!checkSignature(page, 0x7e)) return null;
  const hw = page[10];
  const slot = effects.findIndex((e) => e.hw === hw);
  if (slot < 0) return null;
  const packed = page[0x3b + slot * 2];
  const colorIdx = packed & 0x0f;
  const color: [number, number, number] = tab && colorIdx === 0 ? [tab[21 * (slot + 1)], tab[21 * (slot + 1) + 1], tab[21 * (slot + 1) + 2]] : COLORS[colorIdx] ?? [255, 255, 255];
  return { mode: effects[slot].mode, brightness: page[0x3a + slot * 2], speed: packed >> 4, colorful: colorIdx === COLOR_RANDOM, color, direction: 0 };
}
