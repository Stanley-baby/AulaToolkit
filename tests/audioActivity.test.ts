import { describe, expect, it } from 'vitest';
import { isAudible } from '../src/shared/audioActivity';

describe('system audio activity', () => {
  it('does not classify silence or missing samples as playing', () => {
    expect(isAudible(new Uint8Array())).toBe(false);
    expect(isAudible(new Uint8Array(2048).fill(128))).toBe(false);
  });
  it('detects an alternating waveform without relying on the frequency display', () => {
    expect(isAudible(Uint8Array.from({ length: 2048 }, (_, i) => i % 2 ? 144 : 112))).toBe(true);
  });
});
