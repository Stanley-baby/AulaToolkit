import { useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import type { UpdateState } from '@shared/ipc';
import { useStore, useT } from '../store';
import { Card, Select, Toggle } from './ui';

export const UpdatesPanel = () => {
  const t = useT();
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const [st, setSt] = useState<UpdateState | null>(null);
  useEffect(() => {
    void window.aula.updateState().then(setSt);
    return window.aula.onUpdate(setSt);
  }, []);
  const busy = st?.status === 'checking' || st?.status === 'downloading';
  const statusText = (): string => {
    switch (st?.status) {
      case 'checking': return t('updChecking');
      case 'available': return `${t('updAvailable')} ${st.latest}`;
      case 'downloading': return `${t('updDownloading')} ${st.progress ?? 0}%`;
      case 'ready': return `${t('updReady')} ${st.latest}`;
      case 'upToDate': return `${t('updUpToDate')}${st.checkedAt ? ` · ${new Date(st.checkedAt).toLocaleTimeString()}` : ''}`;
      case 'error': return `${t('updError')}`;
      default: return t('updIdle');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card title={t('updCheckTitle')} right={
        st?.status === 'ready' ? <button className="btn btn-primary btn-sm" onClick={() => window.aula.updateInstall()}><RotateCw size={14} />{t('updInstall')}</button>
        : st?.status === 'available' ? <button className="btn btn-primary btn-sm" onClick={() => void window.aula.updateDownload()}><Download size={14} />{t('updDownload')}</button>
        : <button className="btn btn-sm" disabled={busy} onClick={() => void window.aula.updateCheck()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{t('updCheck')}</button>
      }>
        <div className="text-sm">{statusText()}</div>
        {st?.error && <p role="alert" className="text-xs text-muted mt-2 select-text">{st.error}</p>}
        <div className="text-xs text-muted mt-1">{t('version')} {st?.current ?? ''}</div>
        {st?.status === 'downloading' && <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--color-line)' }}><div className="h-full transition-all" style={{ width: `${st.progress ?? 0}%`, background: 'linear-gradient(90deg,var(--color-accent),var(--color-accent-2))' }} /></div>}
      </Card>
      <Card title={t('updSettings')}>
        <Select label={t('updChannel')} value={prefs.updateChannel} options={[{ value: 'stable', label: t('updStable') }, { value: 'beta', label: 'Beta' }]} onChange={(v) => void setPrefs({ updateChannel: v })} />
        <Select label={t('updInterval')} value={prefs.updateInterval} options={[['never', t('updNever')], ['hourly', t('updHourly')], ['3h', t('upd3h')], ['12h', t('upd12h')], ['daily', t('updDaily')], ['weekly', t('updWeekly')], ['monthly', t('updMonthly')]].map(([v, l]) => ({ value: v as string, label: l }))} onChange={(v) => void setPrefs({ updateInterval: v as typeof prefs.updateInterval })} />
        <Toggle label={t('updAuto')} on={prefs.autoDownload} onChange={(v) => void setPrefs({ autoDownload: v })} />
      </Card>
    </div>
  );
};
