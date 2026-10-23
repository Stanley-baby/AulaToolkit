import { BatteryCharging, BatteryMedium, Cable, Home as HomeIcon, Radio } from 'lucide-react';
import { MODELS } from '@shared/models';
import { imageFor } from '../assets';
import { useStore, useT } from '../store';

export const Sidebar = () => {
  const t = useT();
  const devices = useStore((s) => s.devices);
  const selected = useStore((s) => s.selectedModel);
  const page = useStore((s) => s.page);
  const select = useStore((s) => s.select);
  const setPage = useStore((s) => s.setPage);
  const settings = useStore((s) => s.settings);

  const known = useStore((st) => st.prefs.knownDevices ?? []);
  const connected = MODELS.filter((m) => devices.some((d) => d.modelId === m.id));
  const offline = MODELS.filter((m) => known.includes(m.id) && !devices.some((d) => d.modelId === m.id));

  const Item = ({ id, name, brand, online }: { id: string; name: string; brand: string; online: boolean }) => {
    const dev = devices.find((d) => d.modelId === id);
    const model = MODELS.find((m) => m.id === id)!;
    const img = model.variants?.find((v) => v.id === settings[id]?.variant)?.image ?? model.image;
    const active = page === 'device' && selected === id;
    return (
      <button
        onClick={() => select(id)}
        className="w-full flex items-center gap-3 rounded-2xl p-2.5 text-left transition-all"
        style={{
          background: active ? 'var(--color-panel-2)' : 'transparent',
          boxShadow: active ? 'inset 0 0 0 1px var(--color-line-2)' : undefined,
          opacity: online ? 1 : 0.55,
        }}
      >
        <div className="h-12 w-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
          <img src={imageFor(img)} alt={name} className="h-full w-full object-contain" draggable={false} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted">{brand}</div>
          <div className="font-semibold truncate">{settings[id]?.nickname || name}</div>
          <div className="flex items-center gap-1.5 text-[11px] mt-0.5" style={{ color: online ? 'var(--color-ok)' : 'var(--color-muted)' }}>
            {online ? (dev?.link === 'usb' ? <Cable size={12} /> : <Radio size={12} />) : <span className="h-1.5 w-1.5 rounded-full bg-current inline-block" />}
            {online ? (dev?.link === 'usb' ? t('usb') : t('wireless')) : t('disconnected')}
            {dev?.battery !== null && dev?.battery !== undefined && (
              <span className="ml-auto flex items-center gap-1 text-muted">{dev.charging ? <BatteryCharging size={12} /> : <BatteryMedium size={12} />}{dev.battery}%</span>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <aside className="w-64 shrink-0 p-3 flex flex-col gap-2 overflow-y-auto" style={{ borderRight: '1px solid var(--color-line)' }}>
      <button onClick={() => setPage('home')} className="w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-medium transition-all" style={{ background: page === 'home' ? 'var(--color-panel-2)' : 'transparent', boxShadow: page === 'home' ? 'inset 0 0 0 1px var(--color-line-2)' : undefined }}>
        <HomeIcon size={16} />{t('home')}
      </button>
      <div className="label px-2 pt-3">{t('devices')}</div>
      {connected.map((m) => <Item key={m.id} id={m.id} name={m.name} brand={m.brand} online />)}
      {!connected.length && <div className="text-xs text-muted px-2 py-2">{t('noDevices')}</div>}
      {offline.map((m) => <Item key={m.id} id={m.id} name={m.name} brand={m.brand} online={false} />)}
      <div className="flex-1" />
      <div className="text-[10px] text-muted px-2 pb-1">{t('deviceImageCredit')}</div>
    </aside>
  );
};
