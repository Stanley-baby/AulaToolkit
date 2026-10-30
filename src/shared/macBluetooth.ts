export interface MacBluetoothDevice { name: string; connected: boolean; battery: number | null }

/** system_profiler's battery keys vary between Bluetooth HID implementations. */
export function parseMacBluetooth(value: unknown): MacBluetoothDevice[] {
  const controllers = (value as { SPBluetoothDataType?: unknown[] } | null)?.SPBluetoothDataType;
  if (!Array.isArray(controllers)) return [];
  const result: MacBluetoothDevice[] = [];
  for (const controller of controllers) {
    if (!controller || typeof controller !== 'object') continue;
    for (const key of ['device_connected', 'device_not_connected'] as const) {
      const entries = (controller as Record<string, unknown>)[key];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        for (const [name, properties] of Object.entries(entry)) {
          if (!properties || typeof properties !== 'object') continue;
          const p = properties as Record<string, unknown>;
          const raw = p.device_batteryLevelMain ?? p.device_batteryPercent ?? p.device_batteryLevel;
          const match = typeof raw === 'number' || typeof raw === 'string' ? String(raw).match(/^\s*(\d+(?:\.\d+)?)\s*%?\s*$/) : null;
          const pct = match ? Number(match[1]) : NaN;
          result.push({ name, connected: key === 'device_connected', battery: pct >= 0 && pct <= 100 ? pct : null });
        }
      }
    }
  }
  return result;
}
