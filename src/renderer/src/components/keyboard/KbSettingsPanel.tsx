import { modelById } from '@shared/models';
import { customSleepMinutes, customSleepSelector, sleepMinutes } from '@shared/protocols/aula04';
import { useEffect, useState } from 'react';
import { activeProfile, useStore, useT, useTn } from '../../store';
import { Card, Select, Toggle } from '../ui';

export const KbSettingsPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const profile = useStore((s) => activeProfile(s, modelId));
  const update = useStore((s) => s.updateProfile);
  const toast = useStore((s) => s.toast);
  const call = useStore((s) => s.call);
  const dev = useStore((s) => s.deviceFor(modelId));
  const blackout = useStore((s) => s.settings[modelId]?.displayBlackout !== false);
  const setBlackout = useStore((s) => s.setDisplayBlackout);
  const kb = profile?.keyboard;
  const customMinutes = kb ? customSleepMinutes(kb.settings.sleep) : null;
  const [sleepDraft, setSleepDraft] = useState(String(customMinutes ?? 10));
  const [deepSleepDraft, setDeepSleepDraft] = useState(String(kb?.settings.deepSleepMinutes ?? 5));
  const [editingCustomSleep, setEditingCustomSleep] = useState(customMinutes !== null);
  useEffect(() => {
    setSleepDraft(String(customMinutes ?? 10));
    setDeepSleepDraft(String(kb?.settings.deepSleepMinutes ?? 5));
    setEditingCustomSleep(customMinutes !== null);
  }, [profile?.id, customMinutes, kb?.settings.deepSleepMinutes]);
  if (!kb) return null;
  const set = (key: string, v: number): void => update(modelId, (p) => { if (p.keyboard) p.keyboard.settings[key] = v; }, 'settings');
  const label = (key: string, fallback: string): string => ({ winLock: t('winLock'), altF4: t('altF4'), altTab: t('altTab'), fnSwitch: t('fnSwitch'), sleep: t('sleep'), response: t('response') } as Record<string, string>)[key] ?? fallback;
  const applyCustomSleep = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const first = Number(sleepDraft);
    const deepInput = event.currentTarget.elements.namedItem('sleep-deep-minutes') as HTMLInputElement | null;
    if (deepInput) deepInput.setCustomValidity(Number(deepSleepDraft) > first ? '' : t('smartSleepRange'));
    if (!event.currentTarget.reportValidity()) return;
    if (dev && !dev.customSleep) { toast(t('customSleepUnsupported'), 'error'); return; }
    if (kb.settings.fastWake === 2) {
      const deep = Number(deepSleepDraft);
      update(modelId, (p) => {
        if (!p.keyboard) return;
        p.keyboard.settings.sleep = customSleepSelector(first);
        p.keyboard.settings.deepSleepMinutes = deep;
      }, 'settings');
      return;
    }
    set('sleep', customSleepSelector(first));
  };
  const selectSleep = (value: string | number): void => {
    if (value === 'custom') { setEditingCustomSleep(true); return; }
    const first = sleepMinutes(Number(value)) ?? 3;
    setEditingCustomSleep(false);
    if (kb.settings.fastWake !== 2) { set('sleep', Number(value)); return; }
    const deep = Number(kb.settings.deepSleepMinutes);
    update(modelId, (p) => {
      if (!p.keyboard) return;
      p.keyboard.settings.sleep = customSleepSelector(first);
      p.keyboard.settings.deepSleepMinutes = Number.isInteger(deep) && deep > first ? deep : Math.min(120, first + 1);
    }, 'settings');
  };
  const setSleepMode = (mode: number): void => update(modelId, (p) => {
    if (!p.keyboard) return;
    p.keyboard.settings.fastWake = mode;
    if (mode !== 2) return;
    let first = sleepMinutes(p.keyboard.settings.sleep) ?? 3;
    if (first < 1 || first >= 120) first = 3;
    const deep = p.keyboard.settings.deepSleepMinutes;
    p.keyboard.settings.sleep = customSleepSelector(first);
    p.keyboard.settings.deepSleepMinutes = Number.isInteger(deep) && deep > first && deep <= 120 ? deep : Math.max(5, first + 1);
  }, 'settings');

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card title={t('kbConfig')}>
        {(model.settings ?? []).map((s) => s.key === 'sleep' && model.id === 's75pro' ? (
          <div key={s.key} className="py-2">
            <Select label={label(s.key, s.label)} value={customMinutes !== null || editingCustomSleep ? 'custom' : (kb.settings.sleep ?? s.default)} options={[
              ...(s.options ?? []).map(([value, name]) => ({ value, label: tn(name) })),
              { value: 'custom', label: t('custom') },
            ]} onChange={selectSleep} />
            {(customMinutes !== null || editingCustomSleep) && (
              <form className="flex items-end gap-2 mt-2" onSubmit={applyCustomSleep}>
                <label className="flex-1 text-xs text-muted">{t('customSleepMinutes')}
                  <input className="input w-full mt-1" name="sleep-first-minutes" type="number" inputMode="numeric" min="1" max="120" step="1" required aria-describedby={kb.settings.fastWake === 2 ? 'smart-sleep-hint' : undefined} value={sleepDraft} onChange={(e) => setSleepDraft(e.target.value)} />
                </label>
                {kb.settings.fastWake === 2 && (
                  <label className="flex-1 text-xs text-muted">{t('smartSleepDeepMinutes')}
                    <input className="input w-full mt-1" name="sleep-deep-minutes" type="number" inputMode="numeric" min="2" max="120" step="1" required aria-describedby="smart-sleep-hint" value={deepSleepDraft} onChange={(e) => { e.currentTarget.setCustomValidity(''); setDeepSleepDraft(e.target.value); }} />
                  </label>
                )}
                <button type="submit" className="btn" disabled={!!dev && !dev.customSleep}>{kb.settings.fastWake === 2 ? t('smartSleepApply') : t('customSleepApply')}</button>
              </form>
            )}
            <p className="text-xs text-muted mt-2">{dev && !dev.customSleep ? t('customSleepUnsupported') : t('customSleepHint')}</p>
          </div>
        ) :
          s.type === 'check' ? (
            <Toggle key={s.key} label={label(s.key, s.label)} on={!!kb.settings[s.key]} onChange={(v) => set(s.key, v ? 1 : 0)} />
          ) : (
            <Select key={s.key} label={label(s.key, s.label)} value={kb.settings[s.key] ?? s.default} options={(s.options ?? []).map(([v, l]) => ({ value: v, label: tn(l) }))} onChange={(v) => set(s.key, v)} />
          ),
        )}
        {model.id === 's75pro' && dev?.smartSleepControl ? (
          <div className="py-2">
            <Select label={t('sleepMode')} value={kb.settings.fastWake ?? 1} options={[
              { value: 0, label: t('sleepModeDeep') },
              { value: 1, label: t('sleepModeQuick') },
              { value: 2, label: t('sleepModeSmart') },
            ]} onChange={setSleepMode} />
            <p id="smart-sleep-hint" className="text-xs text-muted mt-1">{t('smartSleepHint')}</p>
          </div>
        ) : model.id === 's75pro' && (
          <Toggle label={t('fastWake')} hint={dev?.fastWakeControl ? t('fastWakeHint') : t('fastWakeUnsupported')}
            on={kb.settings.fastWake !== 0} disabled={!dev?.fastWakeControl} onChange={(v) => set('fastWake', v ? 1 : 0)} />
        )}
        {model.features.displayBlackout && (
          <Toggle label={t('displayBlackout')} hint={t('displayBlackoutHint')} on={blackout} onChange={(v) => setBlackout(modelId, v)} />
        )}
      </Card>
      {model.features.clock && (
        <Card title={t('syncClock')}>
          <p className="text-sm text-muted mb-3">{new Date().toLocaleString()}</p>
          <button className="btn" disabled={!dev} onClick={() => void call(modelId, 'syncTime', 1)}>{t('syncClock')}</button>
        </Card>
      )}
    </div>
  );
};
