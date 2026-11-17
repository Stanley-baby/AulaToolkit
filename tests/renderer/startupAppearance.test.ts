import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS } from '../../src/shared/ipc';

vi.mock('../../src/renderer/src/apply', () => ({ schedule: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['zh', 'light', true, 'light'], ['en', 'dark', false, 'dark'],
  ['tr', 'system', false, 'light'], ['zh', 'system', true, 'dark'],
] as const)('prepares %s/%s before ready, without waiting for system accent', async (language, theme, systemDark, expected) => {
  vi.resetModules();
  let finishPrefs!: (p: unknown) => void, finishAccent!: (p: string) => void;
  const preferences = new Promise(r => { finishPrefs = r; });
  const accent = new Promise<string>(r => { finishAccent = r; });
  const root = { dataset: {} as Record<string,string>, style: { setProperty: vi.fn() } };
  vi.stubGlobal('document', { documentElement: root });
  vi.stubGlobal('navigator', { language: 'zh-CN' });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: systemDark, addEventListener: vi.fn() }), aula: {
    getDevices: async () => [], loadPrefs: () => preferences, getLog: async () => [],
    systemAccent: () => accent, loadSettings: () => new Promise(() => {}),
    getBluetooth: async () => ({}), onBluetooth: vi.fn(), onDevices: vi.fn(), onLog: vi.fn(), savePrefs: vi.fn(),
  } });
  const { useStore } = await import('../../src/renderer/src/store');
  const initial = useStore.getState().init();
  expect(useStore.getState().ready).toBe(false);
  const firstReady: unknown[] = [];
  const unsubscribe = useStore.subscribe(s => { if (s.ready) firstReady.push([s.prefs.language, root.dataset.theme]); });
  finishPrefs({ ...DEFAULT_PREFS, language, theme, onboarded: true });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const observed = { ready: useStore.getState().ready, language: useStore.getState().prefs.language, theme: root.dataset.theme };
  finishAccent('#0078d4');
  await initial; for (let i = 0; i < 10; i++) await Promise.resolve();
  unsubscribe();
  expect(observed).toEqual({ ready: true, language, theme: expected });
  expect(firstReady[0]).toEqual([language, expected]);
});

it('does not restore stale preferences when a delayed accent reply arrives', async () => {
  vi.resetModules(); let finishAccent!: (p: string) => void;
  const root = { dataset: {} as Record<string,string>, style: { setProperty: vi.fn() } };
  vi.stubGlobal('document', { documentElement: root }); vi.stubGlobal('navigator', { language: 'zh-CN' });
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener: vi.fn() }), aula: {
    getDevices: async () => [], loadPrefs: async () => ({...DEFAULT_PREFS,language:'zh',theme:'light'}), getLog: async () => [],
    systemAccent: () => new Promise<string>(r => { finishAccent = r; }), loadSettings: () => new Promise(() => {}),
    getBluetooth: async () => ({}), onBluetooth: vi.fn(), onDevices: vi.fn(), onLog: vi.fn(), savePrefs: vi.fn(),
  } });
  const { useStore } = await import('../../src/renderer/src/store');
  const initial = useStore.getState().init(); for (let i=0;i<10;i++) await Promise.resolve();
  await useStore.getState().setPrefs({theme:'dark'});
  finishAccent('#0078d4'); await initial; for(let i=0;i<10;i++) await Promise.resolve();
  expect(root.dataset.theme).toBe('dark');
});
