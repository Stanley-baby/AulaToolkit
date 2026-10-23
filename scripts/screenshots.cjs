// Regenerates the README screenshots in docs/screenshots with neutral, made-up data.
//
//   npm run screenshots                    (English, docs/screenshots)
//   SHOTS_LANG=tr npm run screenshots      (Turkish, docs/screenshots/tr)
//
// Runs the built app (out/) with a throw-away user-data folder, three simulated devices and real
// device scanning switched off, so neither your settings nor your hardware are touched. The app walks
// through its pages, saves the captures and quits; the temporary folder is then deleted.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const lang = process.env.SHOTS_LANG || 'en';
// English shots go to docs/screenshots, other languages to docs/screenshots/<lang> (e.g. SHOTS_LANG=tr).
const out = path.join(root, 'docs', 'screenshots', ...(lang === 'en' ? [] : [lang]));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aula-toolkit-shots-'));

fs.mkdirSync(path.join(userData, 'settings'), { recursive: true });
fs.writeFileSync(path.join(userData, 'settings', 'prefs.json'), JSON.stringify({
  language: lang,
  theme: 'dark',
  accent: 'ember',
  userName: lang === 'tr' ? 'Deniz' : 'Alex', // made-up names, never real data
  onboarded: true,
  knownDevices: ['s75pro', 'sc900', 'f75'],
  autostart: 'off',
  minimizeToTray: true,
  minimizeToTrayOnMinimize: false,
  batteryAlerts: true,
  batteryThreshold: 20,
  blockVendorSoftware: false,
  updateChannel: 'stable',
  updateInterval: 'never',
  autoDownload: false,
  batteryStats: true,
  osd: true,
}, null, 2));

const env = {
  ...process.env,
  AULA_USER_DATA: userData,
  AULA_SIM: 's75pro,sc900,f75',
  AULA_SIM_ONLY: '1',
  AULA_SCREENSHOTS: out,
};
delete env.ELECTRON_RUN_AS_NODE;

const electron = require('electron'); // resolves to the Electron binary path when required from Node
const child = spawn(electron, ['.'], { cwd: root, env, stdio: 'inherit' });
child.on('exit', (code) => {
  fs.rmSync(userData, { recursive: true, force: true });
  console.log(`Screenshots written to ${out}`);
  process.exit(code ?? 0);
});
