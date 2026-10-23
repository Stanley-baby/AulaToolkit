// Optional battery history: samples the reported level, stores it per device and derives estimates
// (equivalent charge cycles, daily drain, remaining time, relative health). Everything here is an
// estimate from the app's own log; the devices expose no fuel-gauge data.
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { DeviceStatus } from '@shared/types';
import type { BatteryStats } from '@shared/ipc';

interface Sample { t: number; pct: number; charging: boolean }
const MAX_SAMPLES = 20000;
const cache = new Map<string, Sample[]>();
let enabled = false;

const dir = (): string => { const d = join(app.getPath('userData'), 'battery'); if (!existsSync(d)) mkdirSync(d, { recursive: true }); return d; };
const file = (modelId: string): string => join(dir(), `${modelId}.json`);
const load = (modelId: string): Sample[] => {
  if (!cache.has(modelId)) { try { cache.set(modelId, JSON.parse(readFileSync(file(modelId), 'utf8'))); } catch { cache.set(modelId, []); } }
  return cache.get(modelId)!;
};
const save = (modelId: string): void => { try { writeFileSync(file(modelId), JSON.stringify(load(modelId))); } catch { /* ignore */ } };

export function setEnabled(on: boolean): void { enabled = on; }

/** Records a sample when the level or charging state changed, or at least every 10 minutes. */
export function record(statuses: DeviceStatus[]): void {
  if (!enabled) return;
  const now = Date.now();
  for (const s of statuses) {
    if (s.battery === null || s.battery === undefined) continue;
    const arr = load(s.modelId);
    const last = arr[arr.length - 1];
    if (last && last.pct === s.battery && last.charging === s.charging && now - last.t < 10 * 60e3) continue;
    arr.push({ t: now, pct: s.battery, charging: s.charging });
    if (arr.length > MAX_SAMPLES) arr.splice(0, arr.length - MAX_SAMPLES);
    save(s.modelId);
  }
}

export function clear(modelId: string): void { cache.set(modelId, []); try { unlinkSync(file(modelId)); } catch { /* ignore */ } }

/** Dev-only: a believable 30-day usage sample for a simulated device, so the card can be previewed. */
function syntheticStats(): BatteryStats {
  const dayMs = 86400e3, today = Math.floor(Date.now() / dayMs);
  const history: { day: number; pct: number }[] = [];
  let pct = 92;
  for (let i = 29; i >= 0; i--) {
    pct -= 9 + Math.round(Math.sin(i * 1.3) * 3 + Math.random() * 4); // daily low drifts down
    if (pct < 15) pct = 96 - Math.round(Math.random() * 6); // a recharge
    history.push({ day: (today - i) * dayMs, pct: Math.max(8, Math.min(100, pct)) });
  }
  return { samples: 30 * 48, since: Date.now() - 30 * dayMs, cycles: 11.5, dailyDrain: 28, remainingHours: 62, lastFull: Date.now() - 2 * dayMs, health: 97, history };
}

export function stats(modelId: string): BatteryStats {
  if ((process.env.AULA_SIM ?? '').split(',').map((x) => x.trim()).includes(modelId)) return syntheticStats();
  const arr = load(modelId);
  const out: BatteryStats = { samples: arr.length, since: arr[0]?.t ?? null, cycles: 0, dailyDrain: null, remainingHours: null, lastFull: null, health: null, history: [] };
  if (arr.length < 2) return out;
  // Discharge segments: consecutive non-charging samples where the level drops.
  let used = 0;
  const segs: { from: number; to: number; drop: number }[] = [];
  let seg: { from: number; to: number; drop: number } | null = null;
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1], b = arr[i];
    if (!a.charging && !b.charging && b.pct < a.pct && b.t - a.t < 6 * 3600e3) {
      used += a.pct - b.pct;
      if (seg) { seg.to = b.t; seg.drop += a.pct - b.pct; } else seg = { from: a.t, to: b.t, drop: a.pct - b.pct };
    } else if (seg) { segs.push(seg); seg = null; }
    if (b.charging && b.pct >= 99) out.lastFull = b.t;
  }
  if (seg) segs.push(seg);
  out.cycles = Math.round((used / 100) * 10) / 10;
  const rate = (list: typeof segs): number | null => {
    const hrs = list.reduce((n, s) => n + (s.to - s.from) / 3600e3, 0);
    const drop = list.reduce((n, s) => n + s.drop, 0);
    return hrs > 1 ? drop / hrs : null;
  };
  const all = rate(segs);
  if (all) {
    out.dailyDrain = Math.round(all * 24 * 10) / 10;
    const cur = arr[arr.length - 1];
    if (!cur.charging) out.remainingHours = Math.round(cur.pct / all);
  }
  // Health: discharge rate of the most recent third of segments vs the first third (needs enough data).
  if (segs.length >= 6) {
    const n = Math.floor(segs.length / 3);
    const early = rate(segs.slice(0, n)), late = rate(segs.slice(-n));
    if (early && late) out.health = Math.max(50, Math.min(100, Math.round((early / late) * 100)));
  }
  // Daily minimum level for the last 30 days, for a small chart.
  const dayMs = 86400e3, today = Math.floor(Date.now() / dayMs);
  const byDay = new Map<number, number>();
  for (const s of arr) { const d = Math.floor(s.t / dayMs); if (today - d < 30) byDay.set(d, Math.min(byDay.get(d) ?? 100, s.pct)); }
  out.history = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, pct]) => ({ day: d * dayMs, pct }));
  return out;
}
