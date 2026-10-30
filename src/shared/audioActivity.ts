/** Time-domain samples use 128 for silence; ignore low-level capture noise. */
export function isAudible(samples: Uint8Array): boolean {
  if (!samples.length) return false;
  let energy = 0;
  for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
  return Math.sqrt(energy / samples.length) > 0.003;
}
