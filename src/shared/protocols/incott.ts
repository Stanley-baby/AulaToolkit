// PixArt "8K wireless" platform protocol (used by the AULA SC900 series; same firmware family as Incott mice).
// Pure encoders/decoders. Transport: 9-byte feature reports on report id 0x09, `09 cmd sub args...`;
// queries are the set opcode with bit 7 set. The device latches one response buffer that must be
// matched on command (and sub-command for echoing opcodes) before being trusted.
//
// Protocol knowledge: reverse-engineered by the Incott/OpenMouse communities and verified on
// hardware; AULA-specific identity bytes verified on an SC900 Pro dongle (`09 8f 03 0c 02 f0 f0`).

import type { KeyAction } from '../types';

export const REPORT_ID = 0x09;
export const USAGE_PAGE = 0xff05;
export const PAYLOAD_LENGTH = 9; // including report id

// AULA's firmware (SC900 series, "Aula SC900PRO.exe") uses the same framing as Incott mice but
// numbers the settings commands 0x0e - n: polling 0x0d, DPI value 0x0c, DPI cycle 0x0b (5 bytes),
// sensor 0x0a, timing 0x09. Buttons (0x06/0x86), macros (0x07) and identity (0x8f) are shared.
// Verified against the decompiled vendor driver and live on an SC900 Pro (2026-10-23).
export const CMD = {
  SET_POLLING: 0x0d, SET_DPI: 0x0c, SET_DPI_CYCLE: 0x0b, SET_SENSOR: 0x0a, SET_TIMING: 0x09,
  SET_BUTTON: 0x06, MACRO_CHUNK: 0x07, SET_RECEIVER_LED: 0x08,
  Q_POLLING: 0x8d, Q_DPI_VALUE: 0x8c, Q_DPI_CYCLE: 0x8b, Q_SENSOR: 0x8a, Q_TIMING: 0x89,
  Q_BUTTON: 0x86, Q_RECEIVER_LED: 0x88, Q_STATUS: 0x81, Q_VERSION: 0x80, Q_IDENTITY: 0x8f,
} as const;

export const SUB = { NONE: 0, LOD: 1, RIPPLE: 2, ANGLE_SNAP: 3, MOTION_SYNC: 4, PERFORMANCE: 5, DEBOUNCE: 1, FIRE_KEY: 2, SLEEP: 3, PROFILE: 9 } as const;

/** Query opcodes whose reply echoes the sub-command at byte 2. */
export const SUB_ECHOING: number[] = [CMD.Q_DPI_VALUE, CMD.Q_SENSOR, CMD.Q_TIMING, CMD.Q_BUTTON];

export const DPI_MIN = 50, DPI_MAX = 45000, DPI_STEP = 50, DPI_STAGES = 6;
export const POLLING_WIRE_TO_HZ: Record<number, number> = { 0: 1000, 1: 500, 2: 250, 3: 125, 4: 8000, 5: 4000, 6: 2000 };
export const POLLING_HZ_TO_WIRE: Record<number, number> = { 1000: 0, 500: 1, 250: 2, 125: 3, 8000: 4, 4000: 5, 2000: 6 };
export const POLLING_WIRED_MAX = 1000;
/** Lift-off distance, tenths of a millimetre <-> wire. */
export const LOD_WIRE_TO_TENTHS: Record<number, number> = { 0: 10, 1: 20, 2: 7 };
export const LOD_TENTHS_TO_WIRE: Record<number, number> = { 10: 0, 20: 1, 7: 2 };
export const LOD_OPTIONS = [7, 10, 20];
export const PERFORMANCE_MODES: { wire: number; name: string }[] = [
  { wire: 2, name: 'HP (performance)' }, { wire: 1, name: 'Corded' }, { wire: 0, name: 'LP (battery saver)' },
];
export const RECEIVER_LED_MODES = ['Connection & polling rate', 'Battery status', 'Battery warning only'];
export const SLEEP_OPTIONS = [10, 30, 60, 120, 300, 600, 900];
export const DEBOUNCE_MAX = 30;
export const BUTTON_COUNT = 6;
export const MACRO_BUFFERS = 10;
export const MACRO_BUFFER_BYTES = 320;
export const MACRO_CHUNK_BYTES = 32;
export const MACRO_MAX_STEPS = 71;

function payload(...values: number[]): Uint8Array {
  const out = new Uint8Array(PAYLOAD_LENGTH);
  out[0] = REPORT_ID;
  values.forEach((v, i) => { out[1 + i] = v & 0xff; });
  return out;
}

export const query = (cmd: number, sub = 0, extra: number[] = []): Uint8Array => payload(cmd, sub, ...extra);

export function setPolling(hz: number): Uint8Array {
  const wire = POLLING_HZ_TO_WIRE[hz];
  if (wire === undefined) throw new RangeError(`Unsupported polling rate ${hz}`);
  return payload(CMD.SET_POLLING, wire);
}

export function validateDpi(dpi: number): void {
  if (!Number.isInteger(dpi) || dpi < DPI_MIN || dpi > DPI_MAX || dpi % DPI_STEP !== 0) throw new RangeError(`DPI out of range: ${dpi}`);
}

/** Edits one stage's stored value. axis: 0 both, 1 X, 2 Y. */
export function setDpiStage(stage: number, dpi: number, axis = 0): Uint8Array {
  if (stage < 0 || stage >= DPI_STAGES) throw new RangeError(`DPI stage out of range: ${stage}`);
  validateDpi(dpi);
  const wire = dpi / DPI_STEP - 1;
  return payload(CMD.SET_DPI, stage, wire & 0xff, (wire >> 8) & 0xff, 0, 0, 0, axis);
}

/** DPI indicator LED effect carried in the DPI-cycle block (vendor UI: Steady / Breathing / Off). */
export const DPI_LED_MODES = ['Steady', 'Breathing', 'Off'];

/**
 * Writes the DPI cycle block: `0b <count> <active> <ledEffect> <b4> <b5>`. The vendor always writes all
 * five bytes, so the last two are read back first and preserved (`extra`). Never edits stage values.
 */
export function setDpiCycle(count: number, active: number, ledEffect = 0, extra: [number, number] = [1, 1]): Uint8Array {
  if (count < 1 || count > DPI_STAGES || active < 0 || active >= count) throw new RangeError('DPI cycle out of range');
  return payload(CMD.SET_DPI_CYCLE, count, active, ledEffect & 0xff, extra[0] & 0xff, extra[1] & 0xff);
}

export const setLiftOff = (tenths: number): Uint8Array => {
  const wire = LOD_TENTHS_TO_WIRE[tenths];
  if (wire === undefined) throw new RangeError(`Unsupported lift-off ${tenths}`);
  return payload(CMD.SET_SENSOR, SUB.LOD, wire);
};
export const setToggle = (sub: number, on: boolean): Uint8Array => payload(CMD.SET_SENSOR, sub, on ? 1 : 0);
export const setPerformance = (wire: number): Uint8Array => payload(CMD.SET_SENSOR, SUB.PERFORMANCE, wire);
export const setDebounce = (ms: number): Uint8Array => payload(CMD.SET_TIMING, SUB.DEBOUNCE, Math.max(0, Math.min(DEBOUNCE_MAX, ms)));
export const setSleep = (s: number): Uint8Array => payload(CMD.SET_TIMING, SUB.SLEEP, s & 0xff, (s >> 8) & 0xff);
export const setFireKey = (times: number, intervalMs: number): Uint8Array => payload(CMD.SET_TIMING, SUB.FIRE_KEY, Math.min(3, times), Math.min(255, intervalMs));
export const setReceiverLed = (mode: number): Uint8Array => payload(CMD.SET_RECEIVER_LED, mode);
export const setProfileIndex = (i: number): Uint8Array => payload(CMD.SET_BUTTON, SUB.PROFILE, i);

// ---- Button bindings: 32-bit little-endian action words ----
export const MOUSE_CODES: Record<number, number> = {
  1: 0x00f00001, 3: 0x00f10001, 2: 0x00f20001, 8: 0x00f40001, 7: 0x00f30001,
};
export const DPI_CODES = { cycle: 0x00030007, up: 0x00010007, down: 0x00020007 } as const;
export const FIRE_CODE = 0x0218f00a;
export const PROFILE_CODE = 0x0000f10a;
export const MACRO_MARKER = 0x0009;

export const keyboardCode = (code: number, mods = 0): number =>
  mods === 0 ? (((code & 0xff) << 8) | 0x80) >>> 0 : (((code & 0xff) << 16) | ((mods & 0xff) << 8)) >>> 0;
export const mediaCode = (usage: number): number => (((usage & 0xffff) << 16) | 0x0003) >>> 0;

export function encodeButton(a: KeyAction | undefined, defaultCode: number): number | null {
  switch (a?.type) {
    case undefined: case 'default': return defaultCode;
    case 'disable': return 0;
    case 'mouse': return MOUSE_CODES[a.id] ?? null;
    case 'dpi': return DPI_CODES[a.op];
    case 'fire': return FIRE_CODE;
    case 'profile': return PROFILE_CODE;
    case 'key': return keyboardCode(a.code, a.mods);
    case 'media': return mediaCode(a.usage);
    case 'macro': return ((a.index << 16) | MACRO_MARKER) >>> 0;
    default: return null;
  }
}

export function decodeButton(code: number): KeyAction {
  if (code === 0) return { type: 'disable' };
  for (const [id, c] of Object.entries(MOUSE_CODES)) if (c === code) return { type: 'mouse', id: Number(id) };
  if (code === DPI_CODES.cycle) return { type: 'dpi', op: 'cycle' };
  if (code === DPI_CODES.up) return { type: 'dpi', op: 'up' };
  if (code === DPI_CODES.down) return { type: 'dpi', op: 'down' };
  if (code === FIRE_CODE) return { type: 'fire' };
  if (code === PROFILE_CODE) return { type: 'profile' };
  if ((code & 0xffff) === MACRO_MARKER) return { type: 'macro', index: code >>> 16, mode: 0 };
  if ((code & 0xffff) === 0x0003) return { type: 'media', usage: code >>> 16 };
  if ((code & 0xff) === 0x80 && (code >>> 16) === 0) return { type: 'key', code: (code >> 8) & 0xff, mods: 0 };
  if ((code & 0xff) === 0 && (code >>> 16) !== 0) return { type: 'key', code: (code >>> 16) & 0xff, mods: (code >> 8) & 0xff };
  return { type: 'default' };
}

/** Factory bindings per wire slot: left, right, middle, back(3), forward(4), DPI cycle(5). */
export const DEFAULT_BUTTON_CODES = [0x00f00001, 0x00f10001, 0x00f20001, 0x00f30001, 0x00f40001, 0x00030007];

export const setButton = (slot: number, code: number): Uint8Array =>
  payload(CMD.SET_BUTTON, slot, code & 0xff, (code >>> 8) & 0xff, (code >>> 16) & 0xff, (code >>> 24) & 0xff);

// ---- Macros: 320-byte buffer sent as 10 x 32-byte output reports, each announced by a header ----
export interface IncottMacroStep { key: number; press: boolean; delayMs: number }

export function macroBuffer(bufferId: number, steps: IncottMacroStep[], loop: 0 | 1 | 2 = 2, cycles = 1, uid = 1): Uint8Array {
  if (steps.length > MACRO_MAX_STEPS) throw new RangeError(`Macro has ${steps.length} steps; max ${MACRO_MAX_STEPS}`);
  const out = new Uint8Array(MACRO_BUFFER_BYTES);
  out[0] = bufferId; out[1] = loop; out[2] = cycles & 0xff; out[3] = (cycles >> 8) & 0xff;
  steps.forEach((s, i) => {
    const at = 4 + i * 4;
    out[at] = (s.press ? 0x00 : 0x80) | 0x01;
    out[at + 1] = s.key & 0xff;
    out[at + 2] = s.delayMs & 0xff;
    out[at + 3] = (s.delayMs >> 8) & 0xff;
  });
  out.set([0x4d, 0x61, 0x63, 0x72, 0x6f], 288);
  out[293] = 0x31 + bufferId;
  const size = (steps.length + 1) * 4 + 128;
  out[304] = size & 0xff; out[305] = (size >> 8) & 0xff; out[306] = (size >> 16) & 0xff; out[307] = (size >> 24) & 0xff;
  out[308] = 16; out[310] = 232; out[311] = 232;
  out[312] = uid & 0xff; out[313] = (uid >>> 8) & 0xff; out[314] = (uid >>> 16) & 0xff; out[315] = (uid >>> 24) & 0xff;
  const len = steps.length * 2;
  out[316] = len & 0xff; out[317] = (len >> 8) & 0xff; out[318] = steps.length;
  return out;
}

export const macroChunkHeader = (chunkIndex: number, bufferId: number): Uint8Array =>
  payload(CMD.MACRO_CHUNK, MACRO_BUFFER_BYTES / MACRO_CHUNK_BYTES, chunkIndex, MACRO_CHUNK_BYTES, bufferId);

export function macroChunks(buffer: Uint8Array): Uint8Array[] {
  return Array.from({ length: MACRO_BUFFER_BYTES / MACRO_CHUNK_BYTES }, (_, i) => buffer.slice(i * MACRO_CHUNK_BYTES, (i + 1) * MACRO_CHUNK_BYTES));
}

/** Converts the app's generic macro steps (down/up/delay events) into Incott's "event + delay after" form. */
export function toIncottSteps(steps: { kind: string; code?: number; ms?: number }[]): IncottMacroStep[] {
  const out: IncottMacroStep[] = [];
  for (const s of steps) {
    if (s.kind === 'delay') { if (out.length) out[out.length - 1].delayMs = Math.min(0xffff, out[out.length - 1].delayMs + (s.ms ?? 0)); continue; }
    if (s.kind === 'KEY_DOWN' || s.kind === 'KEY_UP') out.push({ key: s.code ?? 0, press: s.kind === 'KEY_DOWN', delayMs: 0 });
    // Mouse events cannot be expressed in this macro format; they are skipped.
  }
  return out;
}

// ---- Decoders (frames include the report id at byte 0) ----
export function frameMatches(frame: Uint8Array, cmd: number, sub: number | null, axis: number | null = null): boolean {
  if (frame.length < 3 || frame[0] !== REPORT_ID || frame[1] !== cmd) return false;
  if (sub !== null && frame[2] !== sub) return false;
  if (axis !== null && frame[8] !== axis) return false;
  return true;
}

export const decodePolling = (f: Uint8Array): number | null => frameMatches(f, CMD.Q_POLLING, null) ? POLLING_WIRE_TO_HZ[f[2]] ?? null : null;

export function decodeDpiCycle(f: Uint8Array): { count: number; active: number; ledEffect: number; extra: [number, number] } | null {
  if (!frameMatches(f, CMD.Q_DPI_CYCLE, null)) return null;
  const count = f[2], active = f[3];
  if (count < 1 || count > DPI_STAGES || active >= count) return null;
  return { count, active, ledEffect: f[4], extra: [f[5], f[6]] };
}

export function decodeDpiStage(f: Uint8Array, stage: number, axis: number | null = null): number | null {
  if (!frameMatches(f, CMD.Q_DPI_VALUE, stage, axis) || f.length < 5) return null;
  const dpi = ((f[3] | (f[4] << 8)) + 1) * DPI_STEP;
  return dpi >= DPI_MIN && dpi <= DPI_MAX ? dpi : null;
}

export const decodeToggle = (f: Uint8Array, sub: number): boolean | null =>
  frameMatches(f, CMD.Q_SENSOR, sub) ? (f[3] === 1 ? true : f[3] === 0 ? false : null) : null;
export const decodeLiftOff = (f: Uint8Array): number | null => frameMatches(f, CMD.Q_SENSOR, SUB.LOD) ? LOD_WIRE_TO_TENTHS[f[3]] ?? null : null;
export const decodePerformance = (f: Uint8Array): number | null => frameMatches(f, CMD.Q_SENSOR, SUB.PERFORMANCE) && f[3] <= 2 ? f[3] : null;
export const decodeDebounce = (f: Uint8Array): number | null => frameMatches(f, CMD.Q_TIMING, SUB.DEBOUNCE) && f[3] <= DEBOUNCE_MAX ? f[3] : null;
export const decodeSleep = (f: Uint8Array): number | null => frameMatches(f, CMD.Q_TIMING, SUB.SLEEP) ? f[3] | (f[4] << 8) : null;
export const decodeFireKey = (f: Uint8Array): { times: number; intervalMs: number } | null =>
  frameMatches(f, CMD.Q_TIMING, SUB.FIRE_KEY) ? { times: f[3], intervalMs: f[4] } : null;
export const decodeReceiverLed = (f: Uint8Array): number | null => frameMatches(f, CMD.Q_RECEIVER_LED, null) && f[2] < 3 ? f[2] : null;
export const decodeButtonCode = (f: Uint8Array, slot: number): number | null =>
  frameMatches(f, CMD.Q_BUTTON, slot) && f.length >= 7 ? ((f[6] << 24) | (f[5] << 16) | (f[4] << 8) | f[3]) >>> 0 : null;

export interface Identity { raw: string; modelCode: number; receiver8k: boolean; sensor: 'PAW3395' | 'PAW3950'; guard: number }
export function decodeIdentity(f: Uint8Array): Identity | null {
  if (f.length < 7 || f[0] !== REPORT_ID || f[1] !== CMD.Q_IDENTITY) return null;
  return {
    raw: Array.from(f.subarray(2, 9), (b) => b.toString(16).padStart(2, '0')).join(' '),
    guard: f[2],
    modelCode: f[3],
    receiver8k: f[4] === 0x02,
    sensor: f[5] === 0xf1 || f[6] === 0xf1 ? 'PAW3950' : 'PAW3395',
  };
}

/** Unsolicited input report on id 0x09 (bytes exclude the report id): battery + packed DPI stage / polling index. */
export function decodeInputStatus(b0: number, b1: number): { battery: number; charging: boolean; dpiStage: number; pollingIndex: number } | null {
  const charging = b0 > 100;
  const battery = charging ? b0 - 128 : b0;
  if (battery < 0 || battery > 100) return null;
  return { battery, charging, dpiStage: (b1 >> 4) & 0x0f, pollingIndex: b1 & 0x0f };
}
