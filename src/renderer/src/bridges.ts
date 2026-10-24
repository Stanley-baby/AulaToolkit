// Main-process → renderer bridges that need the profile store:
//  - hardware events (the mouse DPI button) update the active profile without writing anything back;
//  - CLI requests (`aula …`) change the active profile exactly like the UI does, wait until the change
//    has reached the device, show the OSD and reply with a short text result.
import { modelById } from '@shared/models';
import type { CliRequest, CliResult, OsdPayload } from '@shared/ipc';
import type { LightingState } from '@shared/types';
import { USER_LIGHT_MODE } from '@shared/protocols/aula04';
import { useStore } from './store';
import { flush } from './apply';
import { isOverridden, registerOverrides } from './overrides';

const norm = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const ok = (out: string): CliResult => ({ ok: true, out });
const fail = (out: string): CliResult => ({ ok: false, out });

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function run(req: CliRequest): Promise<CliResult> {
  const s = useStore.getState();
  if (req.cmd === 'osd') {
    await s.setPrefs({ osd: req.args[0] === 'on' });
    return ok(`On-screen display ${req.args[0]}.`);
  }
  const model = modelById(req.modelId);
  if (!model) return fail('Unknown device.');
  if (!s.deviceFor(req.modelId)) return fail(`${model.name} is not connected.`);
  if (!(s.prefs.knownDevices ?? []).includes(req.modelId)) return fail(`Finish the setup of ${model.name} in AULA Toolkit first.`);
  const file = await s.ensureSettings(req.modelId);
  const device = s.displayName(req.modelId);
  const active = (): ReturnType<typeof current> => current(req.modelId);
  const osd = (p: Omit<OsdPayload, 'device'>): void => window.aula.showOsd({ device, ...p });
  const [sub, ...rest] = req.args;

  switch (req.cmd) {
    case 'profile': {
      if (!sub || sub === 'list') {
        return ok(file.profiles.map((p) => `${p.id === file.activeProfile ? '*' : ' '} ${p.name}`).join('\n'));
      }
      if (sub !== 'set' || !rest.length) return fail('Usage: aula profile list | aula profile set <name>');
      const want = norm(rest.join(' '));
      const p = file.profiles.find((x) => norm(x.name) === want) ?? file.profiles.find((x) => norm(x.name).startsWith(want));
      if (!p) return fail(`No profile named "${rest.join(' ')}". Profiles: ${file.profiles.map((x) => x.name).join(', ')}`);
      s.setActiveProfile(req.modelId, p.id);
      await flush(req.modelId);
      osd({ kind: 'profile', value: p.name });
      return ok(`${device}: profile "${p.name}" active.`);
    }

    case 'dpi': {
      const m = active()?.mouse;
      if (!m) return fail(`${model.name} has no DPI settings.`);
      if (!sub) {
        return ok(m.dpiStages.slice(0, m.dpiCount).map((v, i) => `${i === m.dpiActive ? '*' : ' '} ${i + 1}  ${v} DPI`).join('\n'));
      }
      if (sub === 'stage') {
        const n = Number(rest[0]);
        if (!Number.isInteger(n) || n < 1 || n > m.dpiCount) return fail(`Stage must be 1-${m.dpiCount}.`);
        s.updateProfile(req.modelId, (p) => { if (p.mouse) p.mouse.dpiActive = n - 1; }, 'dpi');
        await flush(req.modelId);
        osd({ kind: 'dpi', value: String(m.dpiStages[n - 1]), unit: 'DPI', stage: n - 1, count: m.dpiCount });
        return ok(`${device}: DPI stage ${n} (${m.dpiStages[n - 1]} DPI).`);
      }
      const range = model.dpi ?? { min: 50, max: 30000, step: 50 };
      const raw = Number(sub);
      if (!Number.isFinite(raw) || raw < range.min || raw > range.max) return fail(`DPI must be ${range.min}-${range.max}.`);
      const v = Math.round(raw / range.step) * range.step;
      s.updateProfile(req.modelId, (p) => { if (p.mouse) p.mouse.dpiStages[p.mouse.dpiActive] = v; }, 'dpi');
      await flush(req.modelId);
      osd({ kind: 'dpi', value: String(v), unit: 'DPI', stage: m.dpiActive, count: m.dpiCount });
      return ok(`${device}: stage ${m.dpiActive + 1} set to ${v} DPI.`);
    }

    case 'polling': {
      const hz = Number(sub);
      const rates = model.pollingRates ?? [];
      if (!rates.includes(hz)) return fail(`Polling rate must be one of: ${rates.join(', ')} Hz.`);
      if (hz > 1000 && s.deviceFor(req.modelId)?.link === 'usb') return fail('Rates above 1000 Hz need the 2.4 GHz receiver.');
      s.updateProfile(req.modelId, (p) => { if (p.mouse) p.mouse.polling = hz; }, 'perf');
      await flush(req.modelId);
      osd({ kind: 'polling', value: String(hz), unit: 'Hz' });
      return ok(`${device}: polling rate ${hz} Hz.`);
    }

    case 'light':
    case 'brightness': {
      const k = active()?.keyboard;
      if (!k) return fail(`${model.name} has no lighting settings.`);
      const modes = model.lightModes ?? [];
      const range = model.lightRange ?? { brightness: 5, speed: 5 };
      if (req.cmd === 'light' && (!sub || sub === 'list')) {
        return ok(modes.map((x) => `${x.mode === k.lighting.mode ? '*' : ' '} ${s.tn(x.name)}${s.tn(x.name) !== x.name ? `  (${x.name})` : ''}`).join('\n'));
      }
      const next: LightingState = { ...k.lighting };
      if (req.cmd === 'brightness') {
        const b = Number(sub);
        if (!Number.isInteger(b) || b < 0 || b > range.brightness) return fail(`Brightness must be 0-${range.brightness}.`);
        next.brightness = b;
      } else {
        const want = norm([sub, ...rest].join(' '));
        const mode = /^\d+$/.test(sub) ? modes.find((x) => x.mode === Number(sub)) : modes.find((x) => norm(x.name) === want || norm(s.tn(x.name)) === want);
        if (!mode) return fail(`Unknown effect "${[sub, ...rest].join(' ')}". Run "aula light list".`);
        next.mode = mode.mode;
        if (req.opts.color) { const c = hexToRgb(req.opts.color); if (!c) return fail('Colour must look like #ff5a1f.'); next.color = c; next.colorful = false; }
        if (req.opts.brightness) { const b = Number(req.opts.brightness); if (!Number.isInteger(b) || b < 0 || b > range.brightness) return fail(`Brightness must be 0-${range.brightness}.`); next.brightness = b; }
        if (req.opts.speed) { const v = Number(req.opts.speed); if (!Number.isInteger(v) || v < 0 || v > range.speed) return fail(`Speed must be 0-${range.speed}.`); next.speed = v; }
      }
      s.updateProfile(req.modelId, (p) => { if (p.keyboard) p.keyboard.lighting = next; }, 'lighting');
      await flush(req.modelId);
      const name = next.mode === USER_LIGHT_MODE ? s.t('perKey') : s.tn(modes.find((x) => x.mode === next.mode)?.name ?? '');
      osd({ kind: 'light', value: req.cmd === 'brightness' ? `${next.brightness}/${range.brightness}` : name });
      return ok(req.cmd === 'brightness' ? `${device}: brightness ${next.brightness}/${range.brightness}.` : `${device}: effect "${name}".`);
    }
  }
  return fail(`Unknown command "${req.cmd}".`);
}

function current(modelId: string) {
  const file = useStore.getState().settings[modelId];
  return file?.profiles.find((p) => p.id === file.activeProfile);
}

let registered = false;

/** Wires the bridges once the store is ready, then tells main the CLI can be served. */
export function registerBridges(): void {
  if (registered) return;
  registered = true;
  window.aula.onLiveLight((l) => useStore.setState((s) => ({ liveLight: { ...s.liveLight, [l.modelId]: { colors: l.colors, at: l.t } } })));
  registerOverrides();
  window.aula.onHwEvent((e) => {
    const s = useStore.getState();
    if (!s.settings[e.modelId]) return;
    // temporary lighting is not the user's effect
    if (e.kind === 'light' && isOverridden(e.modelId)) return;
    // Changed with the keyboard's own keys or knob: keep the profile in step without writing back.
    // The keyboard does not say which effect is active, so only colour and brightness can be recorded.
    if (e.kind === 'light') {
      s.updateProfile(e.modelId, (p) => {
        const l = p.keyboard?.lighting;
        if (!l) return;
        if (e.change === 'mode') l.mode = e.mode;
        else if (e.change === 'brightness') l.brightness = e.level;
        else if (e.change === 'color' && l.mode !== USER_LIGHT_MODE) {
          if (e.color === 'multi') l.colorful = true;
          else { l.colorful = false; l.color = e.color; }
        }
      }, null);
      return;
    }
    // The device already has the new value: record it in the profile without writing anything back.
    s.updateProfile(e.modelId, (p) => {
      if (!p.mouse) return;
      if (e.kind === 'dpi') p.mouse.dpiActive = e.stage;
      else p.mouse.polling = e.hz;
    }, null);
  });
  window.aula.onCliRequest((id, req) => {
    void run(req).catch((e: Error) => fail(e.message)).then((res) => window.aula.cliReply(id, res));
  });
  window.aula.cliReady();
  // Development screenshot mode: jump to the requested page and tab.
  window.aula.onDevNavigate((n) => {
    const s = useStore.getState();
    // Persist the (default) profiles so other windows such as the tray flyout can read them.
    for (const id of Object.keys(s.settings)) void s.save(id);
    if (n.page === 'device' && n.model) s.select(n.model);
    else s.setPage(n.page);
    setTimeout(() => {
      if (n.tab) window.dispatchEvent(new CustomEvent('aula:tab', { detail: n.tab }));
      if (n.settingsTab) window.dispatchEvent(new CustomEvent('aula:settings-tab', { detail: n.settingsTab }));
      if (n.page === 'settings') window.dispatchEvent(new CustomEvent('aula:settings-dialog', { detail: n.dialog ?? null }));
    }, 250);
  });
}
