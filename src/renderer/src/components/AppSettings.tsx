import { useEffect, useState } from 'react';
import { Bell, ChevronDown, Copy, RotateCcw, Save, TerminalSquare } from 'lucide-react';
import { LogPanel } from './LogPanel';
import { About } from './About';
import { UpdatesPanel } from './UpdatesPanel';
import { SoftwarePanel } from './SoftwarePanel';
import { useStore, useT, useTn } from '../store';
import { ACCENTS } from '../theme';
import { LANGUAGES } from '../i18n';
import { Card, Dropdown, NavRow, Segmented, Select, Toggle } from './ui';
import { BackupSettings, NotificationSettings } from './SettingsDialogs';

export const AppSettings = () => {
  const t = useT();
  const tn = useTn();
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const [advanced, setAdvanced] = useState(false);
  const [dialog, setDialog] = useState<'notifications' | 'backup' | null>(null);
  const [cliPath, setCliPath] = useState('');
  const toast = useStore((st) => st.toast);
  useEffect(() => { void window.aula.buildInfo().then((b) => setCliPath(b.cliPath)); }, []);
  const [tab, setTab] = useState<'general' | 'software' | 'updates' | 'about'>('general');
  useEffect(() => {
    const h = (e: Event): void => setTab((e as CustomEvent<'general' | 'software' | 'updates' | 'about'>).detail);
    const d = (e: Event): void => setDialog((e as CustomEvent<'notifications' | 'backup' | null>).detail);
    window.addEventListener('aula:settings-tab', h);
    window.addEventListener('aula:settings-dialog', d);
    return () => { window.removeEventListener('aula:settings-tab', h); window.removeEventListener('aula:settings-dialog', d); };
  }, []);

  return (
    <div className="p-6 flex flex-col gap-5 max-w-3xl fade-in">
      <div className="flex items-center justify-between">
        <h1 className="h1">{tab === 'about' ? t('about') : tab === 'updates' ? t('updates') : tab === 'software' ? t('softwareControl') : t('settings')}</h1>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'general', label: t('general') }, { value: 'software', label: t('softwareControl') }, { value: 'updates', label: t('updates') }, { value: 'about', label: t('about') }]} />
      </div>
      {tab === 'about' ? <About /> : tab === 'updates' ? <UpdatesPanel /> : tab === 'software' ? <SoftwarePanel /> : <>
      <Card title={t('general')}>
        <div className="py-2 flex items-center justify-between">
          <span className="text-sm">{t('language')}</span>
          <Dropdown value={prefs.language} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} onChange={(v) => void setPrefs({ language: v })} />
        </div>
        <div className="py-2 flex items-center justify-between">
          <span className="flex flex-col"><span className="text-sm">{t('theme')}</span><span className="text-xs text-muted">{t('themeHint')}</span></span>
          <Dropdown value={prefs.theme} options={[{ value: 'system', label: t('system') }, { value: 'light', label: t('light') }, { value: 'dark', label: t('dark') }]} onChange={(v) => void setPrefs({ theme: v })} />
        </div>
        <div className="py-2 flex items-center justify-between gap-4">
          <span className="flex flex-col"><span className="text-sm">{t('accent')}</span><span className="text-xs text-muted">{t('accentHint')}</span></span>
          <div className="flex items-center gap-2">
            <button className="h-7 w-7 rounded-full border-2" title={t('system')} style={{ background: 'conic-gradient(#ff5a1f,#3b82f6,#22c55e,#ec4899,#ff5a1f)', borderColor: prefs.accent === 'system' ? '#fff' : 'transparent' }} onClick={() => void setPrefs({ accent: 'system' })} />
            {ACCENTS.map((a) => <button key={a.id} className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110" title={tn(a.name)} style={{ background: a.hex, borderColor: prefs.accent === a.id ? '#fff' : 'transparent' }} onClick={() => void setPrefs({ accent: a.id })} />)}
            <input type="color" value={prefs.accent.startsWith('#') ? prefs.accent : '#ff5a1f'} onChange={(e) => void setPrefs({ accent: e.target.value })} title={t('custom')} />
          </div>
        </div>
        <label className="flex items-center justify-between gap-4 py-2"><span className="text-sm">{t('yourName')}</span><input className="input w-56" value={prefs.userName} maxLength={32} onChange={(e) => void setPrefs({ userName: e.target.value })} /></label>
        <div className="flex items-center justify-between gap-4 py-2">
          <span className="flex flex-col"><span className="text-sm">{t('autostart')}</span><span className="text-xs text-muted">{t('autostartHint')}</span></span>
          <Dropdown value={prefs.autostart} options={[{ value: 'on', label: t('enabled') }, { value: 'delayed', label: t('enabledDelayed') }, { value: 'off', label: t('disabled') }]} onChange={(v) => void setPrefs({ autostart: v })} />
        </div>
        <Toggle label={t('minimizeToTray')} hint={t('minimizeToTrayHint')} on={prefs.minimizeToTrayOnMinimize} onChange={(v) => void setPrefs({ minimizeToTrayOnMinimize: v })} />
        <Toggle label={t('minimizeTray')} hint={t('minimizeTrayHint')} on={prefs.minimizeToTray} onChange={(v) => void setPrefs({ minimizeToTray: v })} />
        <Toggle label={t('batteryAlerts')} hint={t('batteryAlertsHint')} on={prefs.batteryAlerts} onChange={(v) => void setPrefs({ batteryAlerts: v })} />
        <Toggle label={t('batteryStatsOpt')} hint={t('batteryStatsHint')} on={prefs.batteryStats} onChange={(v) => void setPrefs({ batteryStats: v })} />
        {prefs.batteryAlerts && <Select label={t('batteryThreshold')} value={prefs.batteryThreshold} options={[10, 15, 20, 25, 30].map((v) => ({ value: v, label: prefs.language === 'tr' ? `%${v}` : `${v}%` }))} onChange={(v) => void setPrefs({ batteryThreshold: v })} />}
      </Card>
      <div className="flex flex-col gap-2">
        <NavRow icon={<Bell size={18} />} title={t('notifTitle')} hint={t('notifHint')} onClick={() => setDialog('notifications')} />
        <NavRow icon={<Save size={18} />} title={t('backupTitle')} hint={t('backupHint')} onClick={() => setDialog('backup')} />
      </div>
      {dialog === 'notifications' && <NotificationSettings onClose={() => setDialog(null)} />}
      {dialog === 'backup' && <BackupSettings onClose={() => setDialog(null)} />}
      <Card title={<span className="flex items-center gap-2"><TerminalSquare size={16} className="text-accent-2" />{t('cliTitle')}</span>}>
        <p className="text-sm text-muted mb-3">{t('cliHint')}</p>
        <pre className="font-mono text-xs rounded-xl p-3 mb-3 select-text overflow-x-auto" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-line)' }}>{'aula status\naula dpi stage 2\naula polling 4000\naula light "Spectrum" --brightness 4\naula profile set Default'}</pre>
        {cliPath && (
          <div className="flex items-center gap-2">
            <code className="font-mono text-[11px] text-muted truncate flex-1 select-text">{cliPath}</code>
            <button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(cliPath).then(() => toast(t('saved'), 'ok'))}><Copy size={14} />{t('cliCopy')}</button>
          </div>
        )}
      </Card>
      <Card title={t('resetSettings')}>
        <p className="text-sm text-muted mb-3">{t('resetSettingsHint')}</p>
        <button className="btn btn-danger" onClick={() => { if (confirm(t('resetSettingsConfirm'))) void window.aula.fullReset(); }}><RotateCcw size={14} />{t('resetSettings')}</button>
      </Card>
      <button className="btn btn-ghost self-start" onClick={() => setAdvanced(!advanced)}><ChevronDown size={14} style={{ transform: advanced ? 'rotate(180deg)' : undefined }} />{t('advanced')}</button>
      {advanced && <LogPanel />}
      </>}
    </div>
  );
};
