// Development-only README screenshot mode (AULA_SCREENSHOTS=<dir>, driven by scripts/screenshots.cjs).
// Walks the main window through its pages and saves each one with webContents.capturePage(), so no
// desktop automation is involved and nothing on screen needs to be visible or focused. The script runs
// the app with a throw-away user-data folder and simulated devices only, so no personal data appears.
import type { BrowserWindow, NativeImage } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CH, type DevNavigate } from '@shared/ipc';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const STEPS: (DevNavigate & { name: string })[] = [
  { name: 'home', page: 'home' },
  { name: 'keyboard-overview', page: 'device', model: 's75pro', tab: 'overview' },
  { name: 'keyboard-lighting', page: 'device', model: 's75pro', tab: 'lighting' },
  { name: 'keyboard-keys', page: 'device', model: 's75pro', tab: 'keys' },
  { name: 'keyboard-config', page: 'device', model: 's75pro', tab: 'settings' },
  { name: 'keyboard-macros', page: 'device', model: 's75pro', tab: 'macros' },
  { name: 'keyboard-screen', page: 'device', model: 's75pro', tab: 'screen' },
  { name: 'mouse-overview', page: 'device', model: 'sc900', tab: 'overview' },
  { name: 'mouse-dpi', page: 'device', model: 'sc900', tab: 'dpi' },
  { name: 'mouse-buttons', page: 'device', model: 'sc900', tab: 'buttons' },
  { name: 'mouse-performance', page: 'device', model: 'sc900', tab: 'performance' },
  { name: 'f75-lighting', page: 'device', model: 'f75', tab: 'lighting' },
  { name: 'settings-general', page: 'settings', settingsTab: 'general' },
  { name: 'settings-notifications', page: 'settings', settingsTab: 'general', dialog: 'notifications' },
  { name: 'settings-backup', page: 'settings', settingsTab: 'general', dialog: 'backup' },
  { name: 'settings-software', page: 'settings', settingsTab: 'software' },
  { name: 'settings-updates', page: 'settings', settingsTab: 'updates' },
  { name: 'settings-about', page: 'settings', settingsTab: 'about' },
];

export interface ScreenshotExtras {
  /** Shows a sample OSD and returns its capture. */
  osd(): Promise<NativeImage | null>;
  /** Shows the tray flyout and returns its capture. */
  flyout(): Promise<NativeImage | null>;
}

export async function runScreenshots(dir: string, win: BrowserWindow, extras: ScreenshotExtras, log: (m: string) => void): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const save = (name: string, img: NativeImage | null): void => {
    if (!img || img.isEmpty()) { log(`screenshot ${name}: empty`); return; }
    writeFileSync(join(dir, `${name}.png`), img.toPNG());
    log(`screenshot ${name}.png`);
  };
  win.showInactive();
  // Surface renderer errors in the terminal so a broken page is easy to diagnose.
  win.webContents.on('console-message', (e) => { const d = e as unknown as { level?: string | number; message?: string }; if (d.level === 'error' || d.level === 3) console.log('[renderer]', d.message); });
  await sleep(6000); // let the simulated devices attach and the store settle
  for (const step of STEPS) {
    win.webContents.send(CH.DEV_NAVIGATE, step);
    await sleep(1800);
    await win.webContents.executeJavaScript('document.getAnimations().forEach(a => { if (Number.isFinite(a.effect?.getComputedTiming().endTime)) a.finish(); })');
    save(step.name, await win.webContents.capturePage());
  }
  save('osd', await extras.osd());
  save('tray-flyout', await extras.flyout());
}
