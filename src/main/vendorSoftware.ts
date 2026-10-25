// Detects and (optionally) suppresses the official AULA driver applications, which would otherwise
// talk to the same HID interfaces and fight over settings. Processes are ended with taskkill, autostart
// entries (HKCU Run key, user Startup folder) are disabled, never deleted, and the exes are renamed so
// they can't start (Program Files, needs admin).
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/** Executable names used by the official AULA apps: the "Aula Hub" app and the per-model driver packages. */
export const VENDOR_EXES = ['Aula Hub.exe', 'DeviceDriver.exe', 'OemDrv.exe', 'Aula SC900PRO.exe', 'AULA SC900PRO.exe', 'AulaDriver.exe', 'AULA Driver.exe', 'MouseDriver.exe', 'KeyboardDriver.exe'];
const VENDOR_HINTS = /aula|oemdrv|devicedriver|bycombo|sc900/i;
// our own name matches VENDOR_HINTS too
const isOwn = (path: string): boolean => /aula toolkit/i.test(path) || path.toLowerCase().includes(process.execPath.toLowerCase());
const OFF = '.aulahub-off';

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

// elevate = also kill the ones running as admin (UAC prompt), only when the user clicked
export async function killVendorApps(elevate = false): Promise<number> {
  const apps = await runningVendorApps();
  if (!apps.length) return 0;
  const pids = apps.map((a) => a.pid);
  for (const pid of pids) await run('taskkill.exe', ['/PID', String(pid), '/F']);
  // Anything still alive was started elevated; end those through one UAC-prompted elevated taskkill.
  const left = elevate ? (await runningVendorApps()).filter((a) => pids.includes(a.pid)) : [];
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
    if (m && VENDOR_HINTS.test(m[2]) && !isOwn(m[2])) out.push({ name: m[1].replace(/^AULAHUB_OFF_/, ''), location: 'registry', disabled: m[1].startsWith('AULAHUB_OFF_') });
  }
  const dir = startupDir();
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (VENDOR_HINTS.test(f) && !isOwn(f)) out.push({ name: f.replace(/\.aulahub-off$/, ''), location: 'startup', disabled: f.endsWith('.aulahub-off') });
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
    if (isOwn(value)) {
      // older versions disabled our own entry too, put it back
      if (off) {
        const original = name.slice('AULAHUB_OFF_'.length);
        if (!reg.includes(`    ${original}    `)) await run('reg.exe', ['add', RUN_KEY, '/v', original, '/t', type, '/d', value, '/f']);
        await run('reg.exe', ['delete', RUN_KEY, '/v', name, '/f']);
      }
      continue;
    }
    if (enable && off) { await run('reg.exe', ['add', RUN_KEY, '/v', name.slice('AULAHUB_OFF_'.length), '/t', type, '/d', value, '/f']); await run('reg.exe', ['delete', RUN_KEY, '/v', name, '/f']); }
    if (!enable && !off) { await run('reg.exe', ['add', RUN_KEY, '/v', `AULAHUB_OFF_${name}`, '/t', type, '/d', value, '/f']); await run('reg.exe', ['delete', RUN_KEY, '/v', name, '/f']); }
  }
  const dir = startupDir();
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (!VENDOR_HINTS.test(f) || isOwn(f)) continue;
    const off = f.endsWith('.aulahub-off');
    try {
      if (enable && off) renameSync(join(dir, f), join(dir, f.replace(/\.aulahub-off$/, '')));
      if (!enable && !off) renameSync(join(dir, f), join(dir, `${f}.aulahub-off`));
    } catch { /* ignore locked files */ }
  }
}

export function vendorExecutables(): { path: string; off: boolean }[] {
  if (process.platform !== 'win32') return [];
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs')];
  const names = VENDOR_EXES.map((e) => e.toLowerCase());
  const out: { path: string; off: boolean }[] = [];
  for (const root of new Set(roots.filter((r): r is string => !!r && existsSync(r)))) {
    let dirs: string[] = [];
    try { dirs = readdirSync(root); } catch { continue; }
    for (const d of dirs) {
      if (!VENDOR_HINTS.test(d) || isOwn(d)) continue;
      let files: string[] = [];
      try { files = readdirSync(join(root, d)); } catch { continue; }
      for (const f of files) {
        const off = f.toLowerCase().endsWith(OFF);
        if (names.includes((off ? f.slice(0, -OFF.length) : f).toLowerCase())) out.push({ path: join(root, d, f), off });
      }
    }
  }
  return out;
}

const renamed = (p: string, enable: boolean): string => (enable ? p.slice(0, -OFF.length) : p + OFF);

// sync version, for elevatedHelper.ts
export function renameVendorExecutablesNow(enable: boolean): boolean {
  if (!enable) {
    for (const exe of VENDOR_EXES) { try { execFileSync('taskkill.exe', ['/IM', exe, '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* not running */ } }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); // sync sleep (hacky), lets windows release the files
  }
  for (const x of vendorExecutables()) {
    if (x.off === enable) { try { renameSync(x.path, renamed(x.path, enable)); } catch { /* reported below */ } }
  }
  return vendorExecutables().every((x) => x.off !== enable);
}

// rename (or restore) the exes, asks for admin if that fails
export async function setVendorExecutables(enable: boolean): Promise<'unchanged' | 'done' | 'declined'> {
  const todo = vendorExecutables().filter((x) => x.off === enable);
  if (!todo.length) return 'unchanged';
  if (!enable) await killVendorApps(); // can't rename a running exe
  let denied = false;
  for (const x of todo) {
    try { renameSync(x.path, renamed(x.path, enable)); } catch { denied = true; }
  }
  if (denied) {
    const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`;
    const args = [...(app.isPackaged ? [] : [app.getAppPath()]), `--vendor-exes=${enable ? 'on' : 'off'}`].map((a) => quote(`"${a}"`)).join(',');
    await run('powershell.exe', ['-NoProfile', '-Command', `try { Start-Process -FilePath ${quote(process.execPath)} -ArgumentList ${args} -Verb RunAs -Wait -WindowStyle Hidden } catch { exit 1 }`]);
  }
  return vendorExecutables().every((x) => x.off !== enable) ? 'done' : 'declined';
}

export async function vendorStatus(): Promise<VendorStatus> {
  const [running, auto] = await Promise.all([runningVendorApps(), vendorAutostart()]);
  return { running, autostart: auto.filter((a) => !a.disabled) };
}
