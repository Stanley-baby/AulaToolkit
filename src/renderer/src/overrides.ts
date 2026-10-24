// lighting that temporarily replaces the profile's (the profile itself isn't touched), for now only
// monitor off. profile writes + knob tracking wait meanwhile (apply.ts, bridges.ts)
import { modelById } from '@shared/models';
import { USER_LIGHT_MODE } from '@shared/protocols/aula04';
import { activeProfile, useStore } from './store';

type Look = 'dark' | 'base';

let displayOff = false;
const shown = new Map<string, Exclude<Look, 'base'>>();
let queue: Promise<void> = Promise.resolve();
const serial = (job: () => Promise<void>): void => { queue = queue.then(job).catch(() => undefined); };

export const isOverridden = (modelId: string): boolean => shown.has(modelId);
// only the blackout touches the side bar
export const isBarOverridden = (modelId: string): boolean => shown.get(modelId) === 'dark';

function wanted(modelId: string): Look {
  const s = useStore.getState();
  const model = modelById(modelId);
  const file = s.settings[modelId];
  if (!model?.features.lighting || !file) return 'base';
  if (displayOff && model.features.displayBlackout && file.displayBlackout !== false) return 'dark';
  return 'base';
}

async function show(modelId: string, look: Look, force = false): Promise<void> {
  const s = useStore.getState();
  const model = modelById(modelId);
  const k = activeProfile(s, modelId)?.keyboard;
  const was: Look = shown.get(modelId) ?? 'base';
  if (!model || !k) { shown.delete(modelId); return; }
  if (was === look && !force) return;
  if (!s.deviceFor(modelId)) return; // not connected, done on reconnect
  if (look !== 'base') shown.set(modelId, look);
  try {
    if (look === 'dark') {
      // S75 Pro: brightness 0 turns the strip back on and mode 0 is ignored, so the bar goes first and
      // then an all-black per-key layout at brightness 1.
      const barOff = model.barModes?.find((b) => b.name === 'Off')?.mode;
      if (model.features.bar && barOff !== undefined) await s.call(modelId, 'setBarLight', barOff);
      if (model.features.perkey) await s.call(modelId, 'setUserLight', {}, 1);
      else await s.call(modelId, 'setLighting', { ...k.lighting, brightness: 0 });
      return;
    }
    // bar first, see above
    if (was === 'dark' && model.features.bar && k.barMode !== undefined) await s.call(modelId, 'setBarLight', k.barMode);
    if (k.lighting.mode === USER_LIGHT_MODE) await s.call(modelId, 'setUserLight', k.perKey, k.lighting.brightness);
    else await s.call(modelId, 'setLighting', k.lighting);
    shown.delete(modelId);
  } catch {
    // call() already showed a toast, the next change or reconnect tries again
  }
}

function syncAll(): void {
  serial(async () => {
    const ids = new Set([...useStore.getState().devices.map((d) => d.modelId), ...shown.keys()]);
    for (const id of ids) await show(id, wanted(id));
  });
}

export function registerOverrides(): void {
  window.aula.onDisplayPower((state) => {
    if (displayOff === (state === 'off')) return;
    displayOff = state === 'off';
    syncAll();
  });

  useStore.subscribe((s, prev) => {
    for (const id of Object.keys(s.settings)) {
      const a = s.settings[id], b = prev.settings[id];
      if (a === b || a?.displayBlackout === b?.displayBlackout) continue;
      serial(() => show(id, wanted(id)));
    }
    // reconnected (or switched between cable and receiver)
    if (s.devices !== prev.devices) {
      for (const d of s.devices) {
        if (prev.devices.some((p) => p.key === d.key)) continue;
        if (shown.has(d.modelId) || wanted(d.modelId) !== 'base') serial(() => show(d.modelId, wanted(d.modelId), true));
      }
    }
  });
}
