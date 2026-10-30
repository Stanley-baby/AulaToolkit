import { useEffect, useState } from 'react';
import { Ban, Power, RefreshCw, ShieldCheck } from 'lucide-react';
import type { VendorStatus } from '@shared/ipc';
import { useStore, useT } from '../store';
import { Card, Toggle } from './ui';

export const SoftwarePanel = () => {
  const t = useT();
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const toast = useStore((s) => s.toast);
  const [st, setSt] = useState<VendorStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = (): Promise<void> => window.aula.vendorStatus().then(setSt);
  useEffect(() => { void load(); const id = setInterval(() => void load(), 5000); return () => clearInterval(id); }, []);

  const setBlock = async (on: boolean): Promise<void> => {
    setBusy(true);
    const ok = await window.aula.vendorSetBlock(on);
    if (ok) await setPrefs({ blockVendorSoftware: on }); // declined: keep the old value
    setBusy(false);
    await load();
  };

  const kill = async (): Promise<void> => {
    setBusy(true);
    const n = await window.aula.vendorKill();
    setBusy(false);
    toast(t('vendorKilled').replace('{n}', String(n)), 'ok');
    await load();
  };

  if (window.aula.platform === 'darwin') return <Card title={t('softwareControl')}><p className="text-sm text-muted">{t('windowsSoftwareOnly')}</p></Card>;

  return (
    <div className="flex flex-col gap-5 fade-in">
      <Card title={t('vendorBlock')}>
        <Toggle label={t('vendorBlock')} hint={t('vendorBlockHint')} on={!!prefs.blockVendorSoftware} onChange={(v) => { if (!busy) void setBlock(v); }} />
      </Card>
      <Card title={t('vendorDetected')} right={<button className="btn btn-sm" onClick={() => void load()}><RefreshCw size={14} />{t('refresh')}</button>}>
        {!st ? <div className="text-sm text-muted">…</div> : (
          <div className="flex flex-col gap-3">
            {st.running.length === 0 && st.autostart.length === 0 && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-ok)' }}><ShieldCheck size={16} />{t('vendorNone')}</div>
            )}
            {st.running.map((r) => (
              <div key={r.pid} className="flex items-center gap-3 text-sm">
                <Power size={14} className="text-warn" />
                <div className="flex flex-col min-w-0"><span className="font-medium">{r.name}</span><span className="text-xs text-muted truncate">{r.path}</span></div>
                <span className="chip chip-warn ml-auto">{t('vendorRunning')}</span>
              </div>
            ))}
            {st.autostart.map((a) => (
              <div key={a.name} className="flex items-center gap-3 text-sm">
                <Ban size={14} className="text-muted" />
                <span className="font-medium">{a.name}</span>
                <span className="chip ml-auto">{t('vendorAutostart')}</span>
              </div>
            ))}
            {st.running.length > 0 && <button className="btn self-start" disabled={busy} onClick={() => void kill()}><Power size={14} />{t('vendorKillNow')}</button>}
          </div>
        )}
      </Card>
    </div>
  );
};
