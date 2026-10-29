// Swappable batteries (the SC900 Pro comes with two).
import type { BatteryPacks, DeviceModel, DeviceSettingsFile } from '@shared/types';

/** A, B, ... until the user renames them. */
export function packsOf(model: DeviceModel | undefined, file: DeviceSettingsFile | undefined): BatteryPacks | null {
  if (!model?.batteries) return null;
  if (file?.batteries?.packs.length) return file.batteries;
  const packs = Array.from({ length: model.batteries }, (_, i) => ({ id: String.fromCharCode(97 + i), name: String.fromCharCode(65 + i) }));
  return { packs, installed: packs[0].id };
}

export function nextPack(p: BatteryPacks): { id: string; name: string } {
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(97 + i);
    if (!p.packs.some((x) => x.id === id)) return { id, name: String.fromCharCode(65 + i) };
  }
  const id = `p${Date.now().toString(36)}`;
  return { id, name: String(p.packs.length + 1) };
}
