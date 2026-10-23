import { useEffect, useState } from 'react';
import { BatteryCharging } from 'lucide-react';
import type { BatteryStats } from '@shared/ipc';
import { useStore, useT } from '../store';
import { Card } from './ui';

// Compact layout: the stats sit on the left and the level chart on the right, so the card stays short
// enough for the device overview to fit the fixed window without scrolling.
export const BatteryCard = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const dev = useStore((s) => s.deviceFor(modelId));
  const lang = useStore((s) => s.prefs.language);
  const locale = ({ pt: 'pt-BR', zh: 'zh-CN', uk: 'uk-UA' } as Record<string, string>)[lang] ?? lang;
  const [st, setSt] = useState<BatteryStats | null>(null);
  const load = (): void => { void window.aula.batteryStats(modelId).then(setSt); };
  useEffect(() => { load(); const i = setInterval(load, 60e3); return () => clearInterval(i); }, [modelId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return null;
  const days = st.since ? Math.max(1, Math.round((Date.now() - st.since) / 86400e3)) : 0;
  const fmtH = (h: number): string => (h >= 48 ? `${Math.round(h / 24)} ${t('days')}` : `${h} ${t('hours')}`);
  const Stat = ({ label, value }: { label: string; value: string }) => (
    <div className="flex flex-col min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted truncate" title={label}>{label}</dt>
      <dd className="text-base font-semibold leading-snug">{value}</dd>
    </div>
  );
  const W = 320, H = 72;
  const n = st.history.length;
  const x = (i: number): number => (n <= 1 ? W : (i / (n - 1)) * W);
  const y = (pct: number): number => H - (pct / 100) * H;
  const pts = st.history.map((h, i) => `${x(i)},${y(h.pct)}`).join(' ');
  const firstDay = n ? new Date(st.history[0].day) : null;
  const lastDay = n ? new Date(st.history[n - 1].day) : null;
  const fmtD = (d: Date): string => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  return (
    <Card title={<span className="flex items-center gap-2"><BatteryCharging size={16} className="text-accent-2" />{t('batteryCard')}</span>}>
      <div className="flex gap-6 items-start">
        <dl className="grid grid-cols-4 gap-x-4 gap-y-3 flex-[3] min-w-0">
          <Stat label={t('batteryNow')} value={dev?.battery != null ? `${dev.battery}%` : '—'} />
          <Stat label={t('batteryCycles')} value={st.cycles ? `${st.cycles}` : '—'} />
          <Stat label={t('batteryDrain')} value={st.dailyDrain ? `${st.dailyDrain}% / ${t('day')}` : '—'} />
          <Stat label={t('batteryRemaining')} value={st.remainingHours ? fmtH(st.remainingHours) : '—'} />
          <Stat label={t('batteryHealth')} value={st.health ? `≈ ${st.health}%` : t('batteryNeedData')} />
          <Stat label={t('batteryLastFull')} value={st.lastFull ? new Date(st.lastFull).toLocaleDateString(locale) : '—'} />
          <Stat label={t('batteryTracking')} value={days ? `${days} ${t('days')}` : '—'} />
        </dl>
        {n >= 3 && (
          <div className="flex-[2] min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1 truncate">{t('batteryChartTitle')}</div>
            <div className="flex gap-2">
              <div className="flex flex-col justify-between text-[10px] text-muted py-0.5" style={{ height: 64 }}>
                <span>100%</span><span>50%</span><span>0%</span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 64 }}>
                {[0, 0.5, 1].map((g) => (
                  <line key={g} x1="0" x2={W} y1={g * H} y2={g * H} stroke="var(--color-line)" strokeWidth="0.5" strokeDasharray="3 3" />
                ))}
                <polyline points={`0,${H} ${pts} ${W},${H}`} fill="color-mix(in srgb, var(--color-accent) 16%, transparent)" stroke="none" />
                <polyline points={pts} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            {firstDay && lastDay && (
              <div className="flex justify-between text-[10px] text-muted mt-1 ml-9">
                <span>{fmtD(firstDay)}</span><span>{fmtD(lastDay)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="text-[11px] text-muted mt-3">{t('batteryDisclaimer')}</div>
    </Card>
  );
};
