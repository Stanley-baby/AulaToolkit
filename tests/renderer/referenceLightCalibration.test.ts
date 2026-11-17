import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import calibration from './referenceLightCalibration.json';

it('ships the measured, brighter reference atlas with uniform per-switch core intensity', () => {
  const png = readFileSync(new URL('../../src/renderer/src/assets/devices/s75pro-reference-light.png', import.meta.url));
  expect(createHash('sha256').update(png).digest('hex')).toBe(calibration.assetSha256);
  expect(calibration.keys).toHaveLength(80);
  for (const key of calibration.keys) {
    expect(key.after).toBeGreaterThan(key.before);
    expect(Math.abs(key.after - calibration.coreTarget)).toBeLessThan(0.005);
  }
});
