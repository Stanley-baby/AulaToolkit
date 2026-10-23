import { useEffect, useRef } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { DevicePage } from './components/DevicePage';
import { AppSettings } from './components/AppSettings';
import { Home } from './components/Home';
import { VendorWarning } from './components/VendorWarning';
import { Onboarding } from './components/Onboarding';
import { DeviceSetup } from './components/DeviceSetup';
import { modelById } from '@shared/models';
import { useStore } from './store';
import { pullFromDevice } from './apply';
import { registerBridges } from './bridges';

export default function App() {
  const init = useStore((s) => s.init);
  const page = useStore((s) => s.page);
  const toasts = useStore((s) => s.toasts);
  const devices = useStore((s) => s.devices);
  const onboarded = useStore((s) => s.prefs.onboarded);
  const ready = useStore((s) => s.ready);
  const setupModel = useStore((s) => s.setupModel);
  const seen = useRef(new Set<string>());

  useEffect(() => { void init(); }, [init]);
  useEffect(() => { if (ready) registerBridges(); }, [ready]);

  // When a device shows up, read its current settings into the profile. Only the clock gets written.
  useEffect(() => {
    for (const d of devices) {
      if (seen.current.has(d.key)) continue;
      seen.current.add(d.key);
      setTimeout(() => {
        void useStore.getState().ensureSettings(d.modelId).then(() => pullFromDevice(d.modelId)).then(() => {
          // not store.call(): no toast if it fails
          if (modelById(d.modelId)?.features.clock) return window.aula.call(d.key, 'syncTime', 1).catch(() => undefined);
        });
      }, 500);
    }
    for (const k of [...seen.current]) if (!devices.some((d) => d.key === k)) seen.current.delete(k);
  }, [devices]);

  return (
    <div className="h-full flex flex-col hero-bg">
      <TitleBar />
      {ready && !onboarded && <Onboarding />}
      {ready && onboarded && setupModel && <DeviceSetup modelId={setupModel} />}
      <div className="flex-1 flex min-h-0 relative">
        <VendorWarning />
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {page === 'settings' ? <AppSettings /> : page === 'home' ? <Home /> : <DevicePage />}
        </main>
      </div>
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="toast" style={{ borderColor: t.kind === 'error' ? 'var(--color-danger)' : t.kind === 'ok' ? 'var(--color-ok)' : undefined }}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
