// Logs the battery level per device, the estimates are in shared/batteryModel.ts.
// Bluetooth levels come from Windows (bluetoothBattery.ts).
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { modelById } from '@shared/models';
import { analyse, migrate, GAP_MS, type BatteryObs, type LiveState } from '@shared/batteryModel';
import type { DeviceStatus } from '@shared/types';
import type { BatteryStats } from '@shared/ipc';
import type { BluetoothBattery } from './bluetoothBattery';
import { loadDeviceSettings } from './store';

const MAX_OBS = 60000; // > a year of 10 min entries
const HEARTBEAT_MS = 10 * 60e3; // log at least this often while connected
const cache = new Map<string, BatteryObs[]>();
let enabled = false;

const dir = (): string => { const d = join(app.getPath('userData'), 'battery'); if (!existsSync(d)) mkdirSync(d, { recursive: true }); return d; };
const file = (modelId: string): string => join(dir(), `${modelId}.json`);
const load = (modelId: string): BatteryObs[] => {
  if (!cache.has(modelId)) { try { cache.set(modelId, migrate(JSON.parse(readFileSync(file(modelId), 'utf8')))); } catch { cache.set(modelId, []); } }
  return cache.get(modelId)!;
};
const save = (modelId: string): void => { try { writeFileSync(file(modelId), JSON.stringify({ v: 2, obs: load(modelId) })); } catch { /* ignore */ } };

export function setEnabled(on: boolean): void { enabled = on; }

const installed = new Map<string, string>();
const firstPack = 'a';
// which battery is in the device (swappable batteries only)
function packOf(modelId: string): string | undefined {
  if (!modelById(modelId)?.batteries) return undefined;
  if (!installed.has(modelId)) installed.set(modelId, loadDeviceSettings(modelId).batteries?.installed ?? firstPack);
  return installed.get(modelId);
}
export function setInstalledPack(modelId: string, id: string | undefined): void { if (id) installed.set(modelId, id); }

const bluetooth = new Map<string, { pct: number; at: number }>();

const isFresh = (s: DeviceStatus, now: number): boolean => s.note !== 'asleep' && s.batteryAt != null && now - s.batteryAt < GAP_MS;

// A device on its USB cable counts as charging (the keyboard reports no level there).
export function record(statuses: DeviceStatus[]): void {
  if (!enabled) return;
  const now = Date.now();
  for (const s of statuses) {
    if (!modelById(s.modelId)?.features.battery) continue;
    const pct = s.battery ?? null;
    const chg: 0 | 1 = s.charging || s.link === 'usb' ? 1 : 0;
    if (pct === null && !chg) continue; // nothing known yet (just attached, asleep)
    const fresh: 0 | 1 = isFresh(s, now) ? 1 : 0;
    const arr = load(s.modelId);
    const last = arr[arr.length - 1];
    if (last && last.pct === pct && last.chg === chg && last.link === s.link && last.fresh === fresh && now - last.t < HEARTBEAT_MS) continue;
    const bat = packOf(s.modelId);
    arr.push({ t: now, pct, chg, link: s.link, fresh, ...(bat ? { bat } : {}) });
    if (arr.length > MAX_OBS) arr.splice(0, arr.length - MAX_OBS);
    save(s.modelId);
  }
}

// No charging flag over Bluetooth, a charge only shows up as the level rising.
export function recordBluetooth(list: BluetoothBattery[], statuses: DeviceStatus[]): void {
  const now = Date.now();
  // forget unpaired devices
  for (const id of [...bluetooth.keys()]) if (!list.some((b) => b.modelId === id)) bluetooth.delete(id);
  for (const b of list) {
    if (!b.connected || b.pct === null || statuses.some((s) => s.modelId === b.modelId)) { bluetooth.delete(b.modelId); continue; }
    bluetooth.set(b.modelId, { pct: b.pct, at: now });
    if (!enabled) continue;
    const arr = load(b.modelId);
    const last = arr[arr.length - 1];
    if (last && last.pct === b.pct && last.link === 'bluetooth' && now - last.t < HEARTBEAT_MS) continue;
    const bat = packOf(b.modelId);
    arr.push({ t: now, pct: b.pct, chg: 0, link: 'bluetooth', fresh: 1, ...(bat ? { bat } : {}) });
    if (arr.length > MAX_OBS) arr.splice(0, arr.length - MAX_OBS);
    save(b.modelId);
  }
}

export function clear(modelId: string): void { cache.set(modelId, []); try { unlinkSync(file(modelId)); } catch { /* ignore */ } }

/** Dev-only: fake month of use for a simulated device. */
function syntheticObs(now: number): BatteryObs[] {
  const out: BatteryObs[] = [];
  let pct = 100, t = now - 30 * 86400e3;
  while (t < now) {
    const hour = new Date(t).getHours();
    const inUse = hour >= 9 && hour < 23;
    if (pct <= 15) { // a charge on the cable, 40 %/h
      while (pct < 100 && t < now) { out.push({ t, pct, chg: 1, link: 'usb' }); pct = Math.min(100, pct + 7); t += 10 * 60e3; }
      continue;
    }
    out.push({ t, pct, chg: 0, link: '2.4g', fresh: inUse ? 1 : 0 });
    if (Math.random() < (inUse ? 0.09 : 0.01)) pct -= 1;
    t += 10 * 60e3;
  }
  return out;
}

export function stats(modelId: string, status?: DeviceStatus, pack?: string): BatteryStats {
  const now = Date.now();
  const sim = (process.env.AULA_SIM ?? '').split(',').map((x) => x.trim()).includes(modelId);
  const inUse = packOf(modelId);
  const wanted = pack ?? inUse;
  // old entries have no `bat`: first battery
  const obs = (sim ? syntheticObs(now) : load(modelId)).filter((o) => !wanted || (o.bat ?? firstPack) === wanted);
  const bt = bluetooth.get(modelId);
  const live: LiveState | null = wanted !== inUse ? null
    : status ? { pct: status.battery ?? null, at: status.batteryAt ?? null, link: status.link, charging: status.charging || status.link === 'usb', asleep: !isFresh(status, now) }
    : bt && now - bt.at < GAP_MS ? { pct: bt.pct, at: bt.at, link: 'bluetooth', charging: false, asleep: false }
    : null;
  return analyse(obs, now, live);
}
