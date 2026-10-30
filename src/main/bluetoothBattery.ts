// Bluetooth battery levels from Windows. No HID access over Bluetooth, but the PnP device has the level.
import { execFile } from 'node:child_process';
import { parseMacBluetooth } from '@shared/macBluetooth';
import { MODELS } from '@shared/models';

export interface BluetoothBattery { modelId: string; pct: number | null; connected: boolean }

const SCRIPT = (pattern: string): string => `
$bat = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'
$conn = '{83DA6326-97A6-4088-9453-A1923F573B29} 15'
@(Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match '${pattern}' } | ForEach-Object {
  [pscustomobject]@{
    name = $_.FriendlyName
    connected = [bool](Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName $conn -ErrorAction SilentlyContinue).Data
    battery = (Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName $bat -ErrorAction SilentlyContinue).Data
  }
}) | ConvertTo-Json -Compress`;

// TODO: spawns powershell every minute, find something lighter
export function readBluetoothBatteries(): Promise<BluetoothBattery[]> {
  const models = MODELS.filter((m) => m.bluetoothName);
  if (!models.length) return Promise.resolve([]);
  if (process.platform === 'darwin') return new Promise((resolve) => {
    execFile('/usr/sbin/system_profiler', ['SPBluetoothDataType', '-json'], { timeout: 20000, maxBuffer: 2 * 1024 * 1024 }, (_error, out) => {
      try {
        const devices = parseMacBluetooth(JSON.parse(out));
        resolve(models.flatMap((model) => {
          const matches = devices.filter((device) => device.name.toLowerCase().includes(model.bluetoothName!.toLowerCase()));
          const device = matches.find((d) => d.connected && d.battery !== null) ?? matches.find((d) => d.connected) ?? matches[0];
          return device ? [{ modelId: model.id, pct: device.battery, connected: device.connected }] : [];
        }));
      } catch { resolve([]); }
    });
  });
  if (process.platform !== 'win32') return Promise.resolve([]);
  const pattern = models.map((m) => m.bluetoothName!).join('|').replace(/'/g, "''");
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', SCRIPT(pattern)], { windowsHide: true, timeout: 20000 }, (_e, out) => {
      let list: { name: string; connected: boolean; battery: number | null }[] = [];
      try { const parsed = JSON.parse(String(out || '[]')); list = Array.isArray(parsed) ? parsed : [parsed]; } catch { /* none */ }
      const found: BluetoothBattery[] = [];
      for (const m of models) {
        // one pairing per BT channel (AULA-S75Pro-1, -2...), take the connected one
        const mine = list.filter((x) => new RegExp(m.bluetoothName!, 'i').test(x.name ?? ''));
        const d = mine.find((x) => x.connected && typeof x.battery === 'number') ?? mine.find((x) => x.connected) ?? mine[0];
        if (d) found.push({ modelId: m.id, pct: typeof d.battery === 'number' ? d.battery : null, connected: !!d.connected });
      }
      resolve(found);
    });
  });
}
