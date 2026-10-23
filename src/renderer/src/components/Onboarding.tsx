import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useStore, useT } from '../store';
import { Dropdown } from './ui';
import { LANGUAGES } from '../i18n';
import logo from '../assets/logo.svg';
import { Wordmark } from './Wordmark';

/** First-run welcome: language and the name used in greetings. */
export const Onboarding = () => {
  const t = useT();
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const [name, setName] = useState('');
  const finish = (): void => {
    void setPrefs({ userName: name.trim(), onboarded: true }).then(() => {
      const st = useStore.getState();
      const fresh = st.devices.map((d) => d.modelId).find((id) => !(st.prefs.knownDevices ?? []).includes(id));
      if (fresh) useStore.setState({ setupModel: fresh });
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'radial-gradient(900px 500px at 30% 0%, color-mix(in srgb, var(--color-accent) 28%, transparent), transparent 60%), var(--color-bg)' }}>
      <div className="panel glow p-10 w-[520px] flex flex-col gap-6 fade-in">
        <img src={logo} alt="" className="h-20 w-20 drop-shadow-2xl" draggable={false} />
        <div>
          <Wordmark size={13} />
          <h1 className="text-3xl font-bold tracking-tight mt-1">{t('welcomeTitle')}</h1>
          <p className="text-muted mt-2">{t('welcomeText')}</p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('language')}</span>
          <Dropdown value={prefs.language} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} onChange={(v) => void setPrefs({ language: v })} />
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-sm">{t('yourName')}</span>
          <input autoFocus className="input text-base" placeholder={t('yourNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') finish(); }} maxLength={32} />
          <span className="text-xs text-muted">{t('yourNameHint')}</span>
        </label>
        <button className="btn btn-primary self-end" onClick={finish}>{t('getStarted')}<ArrowRight size={16} /></button>
      </div>
    </div>
  );
};
