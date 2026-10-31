import { describe, expect, it } from 'vitest';
import { encodeKeyAction, macroBlock, macroBlockWireless } from '../src/shared/protocols/aula04';
import type { MacroStep } from '../src/shared/types';

const payloads = [
  ['USB', (steps: MacroStep[]) => macroBlock([{ id: 'm', name: 'm', steps }]).data],
  ['wireless', (steps: MacroStep[]) => macroBlockWireless([{ id: 'm', name: 'm', steps }]).data],
] as const;

describe('AULA macro vendor format', () => {
  it.each(payloads)('%s separates adjacent key edges by the vendor minimum delay', (_link, encode) => {
    const data = encode([{ kind: 'KEY_DOWN', code: 4 }, { kind: 'KEY_UP', code: 4 }]);
    expect([...data.subarray(400, 420)]).toEqual([
      3, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 4, 0xb0, 10, 0, 0, 0x50, 0, 0, 4, 0x30,
    ]);
  });
  it.each(payloads)('%s preserves an explicit key hold and the existing packet format', (_link, encode) => {
    const data = encode([{ kind: 'KEY_DOWN', code: 4 }, { kind: 'delay', ms: 100 }, { kind: 'KEY_UP', code: 4 }]);
    expect([...data.subarray(400, 420)]).toEqual([
      3, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 4, 0xb0, 100, 0, 0, 0x50, 0, 0, 4, 0x30,
    ]);
  });
  it.each([0, 2, 3, 4])('leaves the repeat-count byte zero for play mode %i', (mode) => {
    expect(encodeKeyAction({ type: 'macro', index: 0, mode, loops: 7 })).toEqual([6, 0, mode, 0]);
  });
});
