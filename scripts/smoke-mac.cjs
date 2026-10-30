'use strict';
// Real packaged Electron + native node-hid, isolated settings and simulated device writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(__dirname, '..');
const base = ['mac-arm64', 'mac'].map((p) => path.join(root, 'release', p, 'AULA Toolkit.app')).find(fs.existsSync);
assert(base, 'Build the macOS app first.');
const app = path.join(base, 'Contents/MacOS/AULA Toolkit');
const cli = path.join(base, 'Contents/Resources/bin/aula');
const output = path.join(root, 'release/smoke');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aula-mac-smoke-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env, AULA_USER_DATA: profile, AULA_SIM: 's75pro,sc900,f75', AULA_SIM_ONLY: '1', AULA_SCREENSHOTS: output };
delete env.ELECTRON_RUN_AS_NODE;
fs.mkdirSync(path.join(profile, 'settings'), { recursive: true });
fs.writeFileSync(path.join(profile, 'settings/prefs.json'), JSON.stringify({ language: 'en', onboarded: true, knownDevices: ['s75pro', 'sc900', 'f75'], autostart: 'off', updateInterval: 'never', autoDownload: false }));
fs.mkdirSync(output, { recursive: true });

async function main() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const child = spawn(app, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (b) => { log += b; }); child.stderr.on('data', (b) => { log += b; });
  const exited = once(child, 'exit');
  let ws;
  const timeout = setTimeout(() => child.kill('SIGTERM'), 90000);
  try {
    let page;
    for (let i = 0; i < 100 && !page; i++) {
      try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page' && p.url.startsWith('file:') && !p.url.includes('#')); } catch { /* startup */ }
      if (!page) await sleep(150);
    }
    assert(page, 'Renderer debugging target did not start.');
    ws = new WebSocket(page.webSocketDebuggerUrl); await once(ws, 'open');
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      const callbacks = pending.get(message.id);
      if (callbacks) { pending.delete(message.id); message.error ? callbacks.reject(new Error(JSON.stringify(message.error))) : callbacks.resolve(message.result); }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    for (let i = 0; i < 50 && !(await evaluate('!!window.aula && !!document.body && document.body.innerText.length > 50')); i++) await sleep(100);
    assert.equal(await evaluate('window.aula.platform'), 'darwin');
    const devices = await evaluate('window.aula.getDevices()');
    assert.equal(devices.length, 3);
    const result = await evaluate(`(async () => {
      const a = window.aula;
      const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/EcAAAAASUVORK5CYII=';
      const item = await a.libraryAdd({name:'smoke.png',dataUrl:image,thumb:image,frames:1});
      if (!item || await a.libraryGet(item.id) !== image) throw new Error('library round trip');
      await a.saveScreen('s75pro',1,{name:'smoke',dataUrl:image,mode:'fit',frames:1});
      if ((await a.loadScreen('s75pro',1)).name !== 'smoke') throw new Error('screen persistence');
      const settings = await a.loadSettings('s75pro');
      await a.saveSettings('s75pro',settings);
      const calls = [
        ['setSettings',{sleep:3,response:1}], ['setLighting',{mode:1,color:[12,34,56],brightness:3,speed:2}],
        ['setUserLight',{},3], ['setBarLight',0x24], ['setKeymap','base',{}], ['setKeymap','fn',{}],
        ['setMacros',[]], ['syncTime',1]
      ];
      for(const [method,...args] of calls) await a.call('s75pro:sim',method,...args);
      await a.call('sc900:sim','setDpiStages',[400,800,1600]);
      await a.call('f75:sim','setSettings',{sleep:10});
      await a.libraryDelete(item.id);
      return {platform:a.platform,build:await a.buildInfo(),simulatedDeviceCalls:calls.length+2,library:'passed',screenPersistence:'passed',profilePersistence:'passed'};
    })()`);
    const runCli = (...args) => {
      const p = spawnSync(cli, args, { env, encoding: 'utf8', timeout: 15000 });
      assert.equal(p.status, 0, `${args.join(' ')}: ${p.stderr}`);
      return p.stdout.trim();
    };
    assert.equal(JSON.parse(runCli('status', '--json')).length, 3);
    assert(runCli('light', 'list', '-d', 's75pro').includes('Static'));
    assert(runCli('brightness', '3', '-d', 's75pro').includes('3/5'));
    assert(runCli('profile', 'list', '-d', 's75pro').length > 0);
    runCli('osd', 'off'); runCli('osd', 'on');
    ws.close(); ws = null;
    const [code, signal] = await exited;
    assert.equal(code, 0, `app exit ${code}/${signal}\n${log}`);
    const captures = fs.readdirSync(output).filter((f) => f.endsWith('.png'));
    assert(captures.length >= 18, `Only ${captures.length} pages captured.`);
    assert(!/renderer: (?:error|3)\b|Uncaught (?:Error|TypeError)|Error: Cannot find module/.test(log), log);
    const report = { ...result, cli: 'passed', pageCaptures: captures.length, appExit: code };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(output, 'runtime.log'), log);
    console.log(JSON.stringify(report));
  } finally {
    fs.writeFileSync(path.join(output, 'runtime.log'), log);
    clearTimeout(timeout); ws?.close();
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
