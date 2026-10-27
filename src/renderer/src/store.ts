import { create } from 'zustand';
import type { DeviceSettingsFile, DeviceStatus, KeyAnimation, LogEntry, Macro, MusicEffect, Profile } from '@shared/types';
import type { AppPrefs } from '@shared/ipc';
import { DEFAULT_PREFS } from '@shared/ipc';
import { MODELS, modelById } from '@shared/models';
import { newProfile } from '@shared/defaults';
import { DICT, NAMES, detectLang, type Lang, type TKey } from './i18n';
import { schedule, type Section } from './apply';
import { applyTheme, initTheme } from './theme';

export interface Toast { id: number; text: string; kind: 'ok' | 'error' | 'info' }

interface State {
  devices: DeviceStatus[];
  selectedModel: string;
  settings: Record<string, DeviceSettingsFile>;
  prefs: AppPrefs;
  log: LogEntry[];
  toasts: Toast[];
  busy: Record<string, boolean>;
  dirty: Record<string, boolean>;
  /** Latest live LED colours per keyboard model, with the time they arrived. */
  liveLight: Record<string, { colors: Record<number, [number, number, number]>; at: number }>;
  page: 'home' | 'device' | 'settings';
  ready: boolean;
  /** Model currently going through the first-connection setup, if any. */
  setupModel: string | null;
  finishSetup(modelId: string): void;
  setNickname(modelId: string, nickname: string): void;
  setDisplayBlackout(modelId: string, on: boolean): void;
  setMusic(modelId: string, music: MusicEffect): void;
  setKeyAnimation(modelId: string, a: KeyAnimation): void;
  displayName(modelId: string): string;
  init(): Promise<void>;
  select(modelId: string): void;
  setPage(p: 'home' | 'device' | 'settings'): void;
  t(key: TKey): string;
  /** Translates a device-level name (effect, action, option). */
  tn(name: string): string;
  setVariant(modelId: string, variant: string): void;
  forgetDevice(modelId: string): void;
  setPrefs(p: Partial<AppPrefs>): Promise<void>;
  ensureSettings(modelId: string): Promise<DeviceSettingsFile>;
  updateProfile(modelId: string, fn: (p: Profile) => void, section?: Section | null): void;
  setMacros(modelId: string, macros: Macro[]): void;
  addProfile(modelId: string, name: string): void;
  removeProfile(modelId: string, id: string): void;
  renameProfile(modelId: string, id: string, name: string): void;
  duplicateProfile(modelId: string, id: string): void;
  setActiveProfile(modelId: string, id: string): void;
  replaceSettings(modelId: string, data: DeviceSettingsFile): void;
  save(modelId: string): Promise<void>;
  toast(text: string, kind?: Toast['kind']): void;
  setBusy(key: string, v: boolean): void;
  deviceFor(modelId: string): DeviceStatus | undefined;
  call<T = unknown>(modelId: string, method: string, ...args: unknown[]): Promise<T>;
  clearLog(): Promise<void>;
}

let toastId = 0;
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export const useStore = create<State>((set, get) => ({
  devices: [],
  selectedModel: MODELS[0].id,
  settings: {},
  prefs: DEFAULT_PREFS,
  log: [],
  toasts: [],
  busy: {},
  dirty: {},
  liveLight: {},
  page: 'home',
  ready: false,
  setupModel: null,

  async init() {
    const [devices, prefs, log] = await Promise.all([window.aula.getDevices(), window.aula.loadPrefs(), window.aula.getLog()]);
    const lang: Lang = prefs.language && DICT[prefs.language] ? prefs.language : detectLang(navigator.language);
    set({ devices, prefs: { ...prefs, language: lang }, log: log.slice(-500), ready: true });
    await initTheme();
    applyTheme(prefs);
    if (devices.length) set({ selectedModel: devices[0].modelId });
    else if ((prefs.knownDevices ?? []).length) set({ selectedModel: prefs.knownDevices[0] });
    // Stay on the home screen at startup; only a new hot-plug jumps to the device page.
    for (const m of MODELS) void get().ensureSettings(m.id);
    // A model never seen before goes through the setup walkthrough; it joins the known list when that finishes.
    const remember = (list: DeviceStatus[]): void => {
      const known = get().prefs.knownDevices ?? [];
      const fresh = list.map((x) => x.modelId).find((id) => !known.includes(id));
      if (fresh && !get().setupModel && get().prefs.onboarded) set({ setupModel: fresh });
    };
    remember(devices);
    window.aula.onDevices((d) => {
      const prev = get().devices;
      set({ devices: d });
      remember(d);
      const fresh = d.filter((x) => !prev.some((p) => p.key === x.key));
      if (fresh.length) {
        set({ selectedModel: fresh[0].modelId });
        const name = modelById(fresh[0].modelId)?.name ?? fresh[0].productName;
        get().toast(`${name} · ${get().t('connected')}`, 'ok');
      }
    });
    window.aula.onLog((e) => set((s) => ({ log: [...s.log.slice(-999), e] })));
  },

  select: (modelId) => set({ selectedModel: modelId, page: 'device' }),
  setPage: (page) => set({ page }),
  t: (key) => (DICT[get().prefs.language] ?? DICT.en)[key] ?? DICT.en[key] ?? key,
  tn: (name) => NAMES[get().prefs.language]?.[name] ?? name,
  finishSetup(modelId) {
    const known = get().prefs.knownDevices ?? [];
    if (!known.includes(modelId)) void get().setPrefs({ knownDevices: [...known, modelId] }).then(() => get().save(modelId));
    set({ setupModel: null, selectedModel: modelId, page: 'device' });
    // Any other new device waiting?
    const next = get().devices.map((d) => d.modelId).find((id) => id !== modelId && !known.includes(id));
    if (next) setTimeout(() => set({ setupModel: next }), 400);
  },
  setNickname(modelId, nickname) {
    set((s) => ({ settings: { ...s.settings, [modelId]: { ...s.settings[modelId], nickname } } }));
    scheduleSave(modelId, get);
  },
  setDisplayBlackout(modelId, on) {
    set((s) => ({ settings: { ...s.settings, [modelId]: { ...s.settings[modelId], displayBlackout: on } } }));
    scheduleSave(modelId, get);
  },
  setMusic(modelId, music) {
    set((s) => ({ settings: { ...s.settings, [modelId]: { ...s.settings[modelId], music } } }));
    scheduleSave(modelId, get);
  },
  setKeyAnimation(modelId, keyAnimation) {
    set((s) => ({ settings: { ...s.settings, [modelId]: { ...s.settings[modelId], keyAnimation } } }));
    scheduleSave(modelId, get);
  },
  displayName: (modelId) => get().settings[modelId]?.nickname || (modelById(modelId)?.name ?? modelId),
  forgetDevice(modelId) {
    void get().setPrefs({ knownDevices: (get().prefs.knownDevices ?? []).filter((id) => id !== modelId) });
    set((s) => { const settings = { ...s.settings }; delete settings[modelId]; return { settings, page: 'home' }; });
    void window.aula.saveSettings(modelId, { profiles: [], activeProfile: '', macros: [] });
    void window.aula.batteryClear(modelId);
  },
  setVariant(modelId, variant) {
    set((s) => ({ settings: { ...s.settings, [modelId]: { ...s.settings[modelId], variant } } }));
    scheduleSave(modelId, get);
  },

  async setPrefs(p) {
    const prefs = { ...get().prefs, ...p };
    set({ prefs });
    applyTheme(prefs);
    await window.aula.savePrefs(prefs);
  },

  async ensureSettings(modelId) {
    const cur = get().settings[modelId];
    if (cur) return cur;
    const model = modelById(modelId)!;
    let data = await window.aula.loadSettings(modelId);
    if (!data.profiles?.length) {
      const p = newProfile(model, 'Default');
      data = { profiles: [p], activeProfile: p.id, macros: data.macros ?? [] };
    }
    if (!data.profiles.some((p) => p.id === data.activeProfile)) data.activeProfile = data.profiles[0].id;
    set((s) => ({ settings: { ...s.settings, [modelId]: data } }));
    return data;
  },

  updateProfile(modelId, fn, section = 'all') {
    set((s) => {
      const file = s.settings[modelId];
      if (!file) return {};
      const profiles = file.profiles.map((p) => {
        if (p.id !== file.activeProfile) return p;
        const copy = structuredClone(p);
        fn(copy);
        return copy;
      });
      return { settings: { ...s.settings, [modelId]: { ...file, profiles } } };
    });
    scheduleSave(modelId, get);
    if (section) schedule(modelId, section);
  },

  setMacros(modelId, macros) {
    set((s) => ({ settings: { ...s.settings, [modelId]: { ...s.settings[modelId], macros } } }));
    scheduleSave(modelId, get);
    schedule(modelId, 'macros');
  },

  addProfile(modelId, name) {
    const model = modelById(modelId)!;
    const p = newProfile(model, name);
    set((s) => ({ settings: { ...s.settings, [modelId]: { ...s.settings[modelId], profiles: [...s.settings[modelId].profiles, p], activeProfile: p.id } } }));
    scheduleSave(modelId, get);
  },

  removeProfile(modelId, id) {
    set((s) => {
      const file = s.settings[modelId];
      if (file.profiles.length <= 1) return {};
      const profiles = file.profiles.filter((p) => p.id !== id);
      return { settings: { ...s.settings, [modelId]: { ...file, profiles, activeProfile: file.activeProfile === id ? profiles[0].id : file.activeProfile } } };
    });
    scheduleSave(modelId, get);
  },

  renameProfile(modelId, id, name) {
    set((s) => ({ settings: { ...s.settings, [modelId]: { ...s.settings[modelId], profiles: s.settings[modelId].profiles.map((p) => (p.id === id ? { ...p, name } : p)) } } }));
    scheduleSave(modelId, get);
  },

  duplicateProfile(modelId, id) {
    set((s) => {
      const file = s.settings[modelId];
      const src = file.profiles.find((p) => p.id === id);
      if (!src) return {};
      const copy: Profile = { ...structuredClone(src), id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: `${src.name} (copy)` };
      return { settings: { ...s.settings, [modelId]: { ...file, profiles: [...file.profiles, copy], activeProfile: copy.id } } };
    });
    scheduleSave(modelId, get);
  },

  setActiveProfile(modelId, id) {
    set((s) => ({ settings: { ...s.settings, [modelId]: { ...s.settings[modelId], activeProfile: id } } }));
    scheduleSave(modelId, get);
    schedule(modelId, 'all');
  },

  replaceSettings(modelId, data) {
    set((s) => ({ settings: { ...s.settings, [modelId]: data } }));
    scheduleSave(modelId, get);
    schedule(modelId, 'all');
  },

  async save(modelId) {
    const data = get().settings[modelId];
    if (data) await window.aula.saveSettings(modelId, data);
  },

  toast(text, kind = 'info') {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 6000 : 3000);
  },

  setBusy: (key, v) => set((s) => ({ busy: { ...s.busy, [key]: v } })),
  deviceFor: (modelId) => get().devices.find((d) => d.modelId === modelId),

  async call<T>(modelId: string, method: string, ...args: unknown[]): Promise<T> {
    const dev = get().deviceFor(modelId);
    if (!dev) throw new Error(get().t('disconnected'));
    const key = `${modelId}:${method}`;
    get().setBusy(key, true);
    try {
      return (await window.aula.call(dev.key, method, ...args)) as T;
    } catch (e) {
      get().toast(friendlyError(get().t, (e as Error).message), 'error');
      throw e;
    } finally {
      get().setBusy(key, false);
    }
  },

  async clearLog() { await window.aula.clearLog(); set({ log: [] }); },
}));

function friendlyError(t: (k: TKey) => string, msg: string): string {
  if (/not connected|closed|HID/i.test(msg)) return t('errDisconnected');
  if (/asleep|no reply/i.test(msg)) return t('asleep');
  if (/USB/i.test(msg)) return t('errUsbOnly');
  return t('errGeneric');
}

function scheduleSave(modelId: string, get: () => State): void {
  // Nothing is written for a device until its setup walkthrough has finished (or been skipped).
  if (!(get().prefs.knownDevices ?? []).includes(modelId)) return;
  clearTimeout(saveTimers[modelId]);
  saveTimers[modelId] = setTimeout(() => void get().save(modelId), 400);
}

export const useT = (): ((k: TKey) => string) => useStore((s) => s.t);
export const useTn = (): ((n: string) => string) => useStore((s) => s.tn);

export const activeProfile = (s: State, modelId: string): Profile | undefined => {
  const f = s.settings[modelId];
  return f?.profiles.find((p) => p.id === f.activeProfile);
};
