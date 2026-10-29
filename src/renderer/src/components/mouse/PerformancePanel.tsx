import { modelById } from '@shared/models';
import type { MouseProfile } from '@shared/types';
import { LOD_OPTIONS, PERFORMANCE_MODES, RECEIVER_LED_MODES, SLEEP_OPTIONS } from '@shared/protocols/incott';
import { activeProfile, useStore, useT, useTn } from '../../store';
import { Card, Segmented, Select, Slider, Toggle } from '../ui';
import { Plus, X } from 'lucide-react';
import { nextPack, packsOf } from '../../batteryPacks';

export const PerformancePanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const profile = useStore((s) => activeProfile(s, modelId));
  const update = useStore((s) => s.updateProfile);
  const dev = useStore((s) => s.deviceFor(modelId));
  const m = profile?.mouse;
  if (!m) return null;
  const set = (fn: (mp: MouseProfile) => void): void => update(modelId, (p) => { if (p.mouse) fn(p.mouse); }, 'perf');
  const wired = dev?.link === 'usb';
  const rates = (model.pollingRates ?? [1000]).filter((r) => !wired || r <= 1000);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <Card title={t('polling')}>
        <div className="grid grid-cols-4 gap-2">
          {(model.pollingRates ?? []).map((r) => {
            const enabled = rates.includes(r);
            return (
              <button key={r} disabled={!enabled} onClick={() => set((mp) => { mp.polling = r; })} className="rounded-xl py-3 font-mono text-sm transition-all disabled:opacity-35" style={{ background: m.polling === r ? 'linear-gradient(135deg,var(--color-accent),var(--color-accent-2))' : 'var(--color-bg-2)', color: m.polling === r ? '#fff' : undefined, border: `1px solid ${m.polling === r ? 'transparent' : 'var(--color-line)'}` }}>
                {r >= 1000 ? `${r / 1000}K` : r} Hz
              </button>
            );
          })}
        </div>
        {wired && <div className="text-xs text-muted mt-3">{t('wiredLimit')}</div>}
        <div className="mt-4">
          <div className="text-sm mb-2">{t('perfMode')}</div>
          <Segmented value={m.performance} onChange={(v) => set((mp) => { mp.performance = v; })} options={PERFORMANCE_MODES.map((p) => ({ value: p.wire, label: tn(p.name) }))} />
        </div>
      </Card>
      <Card title={t('sensor')}>
        <div className="py-2 flex items-center justify-between">
          <span className="text-sm">{t('liftOff')}</span>
          <Segmented value={m.liftOff} onChange={(v) => set((mp) => { mp.liftOff = v; })} options={LOD_OPTIONS.map((v) => ({ value: v, label: `${v / 10} mm` }))} />
        </div>
        <Toggle label={t('motionSync')} on={m.motionSync} onChange={(v) => set((mp) => { mp.motionSync = v; })} />
        <Toggle label={t('angleSnap')} on={m.angleSnap} onChange={(v) => set((mp) => { mp.angleSnap = v; })} />
        <Toggle label={t('ripple')} on={m.ripple} onChange={(v) => set((mp) => { mp.ripple = v; })} />
      </Card>
      <Card title={t('settings')}>
        <Slider label={t('debounce')} min={0} max={30} value={m.debounce} onChange={(v) => set((mp) => { mp.debounce = v; })} format={(v) => `${v} ms`} />
        <Select label={t('sleep')} value={m.sleep} options={SLEEP_OPTIONS.map((s) => ({ value: s, label: s >= 60 ? `${s / 60} ${t('min')}` : `${s} ${t('sec')}` }))} onChange={(v) => set((mp) => { mp.sleep = v; })} />
        <Select label={t('receiverLed')} value={m.receiverLed} options={RECEIVER_LED_MODES.map((l, i) => ({ value: i, label: tn(l) }))} onChange={(v) => set((mp) => { mp.receiverLed = v; })} />
      </Card>
      <Card title={t('fireKey')}>
        <div className="py-2 flex items-center justify-between">
          <span className="text-sm">{t('fireTimes')}</span>
          <Segmented value={m.fireKey.times} onChange={(v) => set((mp) => { mp.fireKey.times = v; })} options={[{ value: 0, label: t('hold') }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]} />
        </div>
        <Slider label={t('fireInterval')} min={1} max={255} value={m.fireKey.intervalMs} onChange={(v) => set((mp) => { mp.fireKey.intervalMs = v; })} format={(v) => `${v} ms`} />
      </Card>
      {model.batteries && <BatteryPacksCard modelId={modelId} />}
    </div>
  );
};

const BatteryPacksCard = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const file = useStore((s) => s.settings[modelId]);
  const save = useStore((s) => s.setBatteryPacks);
  const p = packsOf(modelById(modelId), file);
  if (!p) return null;
  const rename = (id: string, name: string): void => save(modelId, { ...p, packs: p.packs.map((x) => (x.id === id ? { ...x, name } : x)) });
  return (
    <Card title={t('batteryPacks')} right={<button className="btn btn-sm" onClick={() => save(modelId, { ...p, packs: [...p.packs, nextPack(p)] })}><Plus size={14} />{t('batteryAdd')}</button>}>
      <p className="text-sm text-muted mb-3">{t('batteryPacksHint')}</p>
      <div className="flex flex-col gap-2">
        {p.packs.map((x) => {
          const inUse = x.id === p.installed;
          return (
            <div key={x.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ background: 'var(--color-bg-2)', border: `1px solid ${inUse ? 'var(--color-accent)' : 'var(--color-line)'}` }}>
              <input type="radio" checked={inUse} onChange={() => save(modelId, { ...p, installed: x.id })} aria-label={t('batteryInUse2')} />
              <span className="text-sm text-muted shrink-0">{t('batteryPack').replace('{n}', '')}</span>
              <input className="input flex-1 min-w-0" value={x.name} maxLength={24} onChange={(e) => rename(x.id, e.target.value)} onBlur={(e) => { if (!e.target.value.trim()) rename(x.id, x.id.toUpperCase()); }} />
              {inUse
                ? <span className="chip shrink-0">{t('batteryInUse2')}</span>
                : p.packs.length > 1 && <button className="btn btn-sm shrink-0" title={t('delete')} onClick={() => save(modelId, { ...p, packs: p.packs.filter((y) => y.id !== x.id) })}><X size={14} /></button>}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
