// Detects and (optionally) suppresses the official AULA driver applications, which would otherwise
// talk to the same HID interfaces and fight over settings. They are plain user-level programs, so
// everything here works without administrator rights: processes are ended with taskkill and their
// autostart entries (HKCU Run key, user Startup folder) are disabled, never deleted.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/** Executable names used by the official AULA apps: the "Aula Hub" app and the per-model driver packages. */
export const VENDOR_EXES = ['Aula Hub.exe', 'DeviceDriver.exe', 'OemDrv.exe', 'Aula SC900PRO.exe', 'AULA SC900PRO.exe', 'AulaDriver.exe', 'AULA Driver.exe', 'MouseDriver.exe', 'KeyboardDriver.exe'];
const VENDOR_HINTS = /aula|oemdrv|devicedriver|bycombo|sc900/i;

export interface VendorApp { name: string; pid: number; path: string }
export interface VendorStatus { running: VendorApp[]; autostart: { name: string; location: string }[] }

const run = (cmd: string, args: string[]): Promise<string> =>
  new Promise((resolve) => execFile(cmd, args, { windowsHide: true, maxBuffer: 4 << 20 }, (_e, out) => resolve(String(out ?? ''))));

/** Lists running processes that belong to an official AULA driver. */
export async function runningVendorApps(): Promise<VendorApp[]> {
  if (process.platform !== 'win32') return [];
  // Elevated processes (the official mouse driver runs as administrator) expose no Path to a normal user,
  // so match on the executable name as well.
  const out = await run('powershell.exe', ['-NoProfile', '-Command', 'Get-Process | Select-Object Id,Name,Path | ConvertTo-Json -Compress']);
  let list: { Id: number; Name: string; Path: string | null }[] = [];
  try { const parsed = JSON.parse(out || '[]'); list = Array.isArray(parsed) ? parsed : [parsed]; } catch { return []; }
  const self = process.execPath.toLowerCase();
  return list
    .filter((p) => p.Name && (p.Path ?? '').toLowerCase() !== self && !(p.Path ?? '').toLowerCase().includes('aula toolkit') && !/^aula-gsi$/i.test(p.Name) && !/^electron$/i.test(p.Name))
    .filter((p) => VENDOR_EXES.some((e) => e.toLowerCase() === `${p.Name}.exe`.toLowerCase()) || (p.Path ? VENDOR_HINTS.test(p.Path) && VENDOR_HINTS.test(p.Name) : /aula|sc900|oemdrv/i.test(p.Name)))
    .map((p) => ({ name: p.Name, pid: p.Id, path: p.Path ?? '' }));
}

export async function killVendorApps(): Promise<number> {
  const apps = await runningVendorApps();
  if (!apps.length) return 0;
  const pids = apps.map((a) => a.pid);
  for (const pid of pids) await run('taskkill.exe', ['/PID', String(pid), '/F']);
  // Anything still alive was started elevated; end those through one UAC-prompted elevated taskkill.
  const left = (await runningVendorApps()).filter((a) => pids.includes(a.pid));
  if (left.length) {
    const args = left.map((a) => `/PID ${a.pid}`).join(' ');
    await run('powershell.exe', ['-NoProfile', '-Command', `Start-Process taskkill.exe -ArgumentList '${args} /F' -Verb RunAs -WindowStyle Hidden -Wait`]);
  }
  return apps.length;
}

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const startupDir = (): string => join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');

/** Autostart entries (enabled or disabled by us) that point at vendor software. */
export async function vendorAutostart(): Promise<{ name: string; location: string; disabled: boolean }[]> {
  if (process.platform !== 'win32') return [];
  const out: { name: string; location: string; disabled: boolean }[] = [];
  const reg = await run('reg.exe', ['query', RUN_KEY]);
  for (const line of reg.split(/\r?\n/)) {
    const m = line.match(/^\s+(.+?)\s+REG_(?:EXPAND_)?SZ\s+(.+)$/);
    if (m && VENDOR_HINTS.test(m[2])) out.push({ name: m[1].replace(/^AULAHUB_OFF_/, ''), location: 'registry', disabled: m[1].startsWith('AULAHUB_OFF_') });
  }
  const dir = startupDir();
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (VENDOR_HINTS.test(f)) out.push({ name: f.replace(/\.aulahub-off$/, ''), location: 'startup', disabled: f.endsWith('.aulahub-off') });
  return out;
}

/** Renames vendor autostart entries so Windows ignores them; `enable` restores the original names. */
export async function setVendorAutostart(enable: boolean): Promise<void> {
  if (process.platform !== 'win32') return;
  const reg = await run('reg.exe', ['query', RUN_KEY]);
  for (const line of reg.split(/\r?\n/)) {
    const m = line.match(/^\s+(.+?)\s+(REG_(?:EXPAND_)?SZ)\s+(.+)$/);
    if (!m || !VENDOR_HINTS.test(m[3])) continue;
    const [, name, type, value] = m;
    const off = name.startsWith('AULAHUB_OFF_');
    if (enable && off) { await run('reg.exe', ['add', RUN_KEY, '/v', name.slice('AULAHUB_OFF_'.length), '/t', type, '/d', value, '/f']); await run('reg.exe', ['delete', RUN_KEY, '/v', name, '/f']); }
    if (!enable && !off) { await run('reg.exe', ['add', RUN_KEY, '/v', `AULAHUB_OFF_${name}`, '/t', type, '/d', value, '/f']); await run('reg.exe', ['delete', RUN_KEY, '/v', name, '/f']); }
  }
  const dir = startupDir();
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (!VENDOR_HINTS.test(f)) continue;
    const off = f.endsWith('.aulahub-off');
    try {
      if (enable && off) renameSync(join(dir, f), join(dir, f.replace(/\.aulahub-off$/, '')));
      if (!enable && !off) renameSync(join(dir, f), join(dir, `${f}.aulahub-off`));
    } catch { /* ignore locked files */ }
  }
}

export async function vendorStatus(): Promise<VendorStatus> {
  const [running, auto] = await Promise.all([runningVendorApps(), vendorAutostart()]);
  return { running, autostart: auto.filter((a) => !a.disabled) };
}
