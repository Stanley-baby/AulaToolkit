import { modelById } from '@shared/models';
import type { MouseProfile } from '@shared/types';
import { activeProfile, useStore, useT, useTn } from '../../store';
import { Card, Segmented, Slider, rgbToHex } from '../ui';
import { DPI_LED_MODES } from '@shared/protocols/incott';

export const DpiPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const profile = useStore((s) => activeProfile(s, modelId));
  const update = useStore((s) => s.updateProfile);
  const dev = useStore((s) => s.deviceFor(modelId));
  const m = profile?.mouse;
  if (!m) return null;
  const d = model.dpi!;
  const set = (fn: (mp: MouseProfile) => void): void => update(modelId, (p) => { if (p.mouse) fn(p.mouse); }, 'dpi');
  const max = dev?.live?.sensor === 'PAW3950' ? 30000 : dev?.live?.sensor === 'PAW3395' ? 26000 : d.max;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
      <Card title={t('dpiStages')}>
        <div className="flex flex-col gap-3">
          {m.dpiStages.slice(0, d.stages).map((v, i) => {
            const inCycle = i < m.dpiCount;
            const active = i === m.dpiActive;
            return (
              <div key={i} className="rounded-2xl p-4 transition-all" style={{ background: active ? 'color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-2))' : 'var(--color-bg-2)', border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-line)'}`, opacity: inCycle ? 1 : 0.5 }}>
                <div className="flex items-center gap-3">
                  <button className="h-8 w-8 rounded-full font-bold text-sm shrink-0" style={{ background: rgbToHex(m.dpiColors[i] ?? [255, 255, 255]), color: '#111', boxShadow: active ? '0 0 0 3px color-mix(in srgb, var(--color-accent) 50%, transparent)' : undefined }} onClick={() => set((mp) => { mp.dpiActive = i; })} title={t('activeStage')}>{i + 1}</button>
                  <input type="number" className="input w-28 font-mono" min={d.min} max={max} step={d.step} value={v} onChange={(e) => set((mp) => { mp.dpiStages[i] = clamp(Number(e.target.value), d.min, max, d.step); })} />
                  <div className="flex-1"><Slider min={d.min} max={max} step={d.step} value={v} onChange={(nv) => set((mp) => { mp.dpiStages[i] = nv; })} /></div>
                  <div className="flex gap-1">
                    {[400, 800, 1600, 3200, 6400].map((q) => <button key={q} className="chip" onClick={() => set((mp) => { mp.dpiStages[i] = q; })}>{q}</button>)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div className="flex flex-col gap-5">
        <Card title={t('stagesInCycle')}>
          <Slider min={1} max={d.stages} value={m.dpiCount} onChange={(v) => set((mp) => { mp.dpiCount = v; if (mp.dpiActive >= v) mp.dpiActive = v - 1; })} />
          <div className="text-xs text-muted">{t('activeStage')}: {m.dpiActive + 1}</div>
        </Card>
        <Card title={t('dpiLed')}>
          <Segmented value={m.dpiLed} onChange={(v) => set((mp) => { mp.dpiLed = v; })} options={DPI_LED_MODES.map((n, i) => ({ value: i, label: tn(n) }))} />
        </Card>
        <Card title={t('sensor')}>
          <div className="text-sm">{dev?.live?.sensor ?? model.specs.find((s) => s.label === 'Sensor')?.value}</div>
          <div className="text-xs text-muted mt-1">{d.min} – {max} DPI · {d.step} step</div>
        </Card>
      </div>
    </div>
  );
};

const clamp = (v: number, min: number, max: number, step: number): number => Math.max(min, Math.min(max, Math.round((isFinite(v) ? v : min) / step) * step));
