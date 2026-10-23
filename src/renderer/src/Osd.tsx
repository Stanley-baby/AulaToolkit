// The on-screen display: device name, the new value and, for DPI and brightness, a strip of stage dots
// (a colour sample for colour changes). Rendered by a click-through, non-focusable window under the #osd hash.
import { useEffect, useState } from 'react';
import { Gauge, Keyboard, Layers, Lightbulb, MousePointer2, Palette, Sparkles, Sun, Zap } from 'lucide-react';
import type { OsdPayload } from '@shared/ipc';
import { DICT, NAMES, type Lang } from './i18n';
import { applyTheme } from './theme';

export const Osd = () => {
  const [p, setP] = useState<OsdPayload | null>(null);
  const [seq, setSeq] = useState(0);
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    void window.aula.loadPrefs().then((pr) => { setLang(pr.language); applyTheme(pr); });
    return window.aula.onOsd((payload) => {
      setP(payload);
      setSeq((n) => n + 1);
      void window.aula.loadPrefs().then((pr) => { setLang(pr.language); applyTheme(pr); });
    });
  }, []);

  if (!p) return null;
  const t = (k: string): string => (DICT[lang] as Record<string, string>)[k] ?? (DICT.en as Record<string, string>)[k] ?? k;
  const caption = { dpi: t('dpi'), polling: t('polling'), profile: t('profile'), light: t('effect'), effect: t('effect'), color: t('color'), brightness: t('brightness') }[p.kind];
  const Icon = { dpi: Gauge, polling: Zap, profile: Layers, light: Lightbulb, effect: Sparkles, color: Palette, brightness: Sun }[p.kind];
  const DeviceIcon = p.kind === 'dpi' || p.kind === 'polling' ? MousePointer2 : p.kind === 'profile' ? Layers : Keyboard;
  const value = p.valueKey ? t(p.valueKey) : p.valueName ? NAMES[lang]?.[p.valueName] ?? p.valueName : p.value;

  return (
    <div className="h-screen w-screen flex items-center justify-center select-none" style={{ background: 'transparent' }}>
      <div
        key={seq}
        className="osd-pop flex items-center gap-4 rounded-2xl pl-3 pr-5 py-3"
        style={{
          background: 'color-mix(in srgb, var(--color-panel) 92%, transparent)',
          border: '1px solid var(--color-line-2)',
          boxShadow: '0 18px 50px -14px rgba(0,0,0,.7), 0 0 0 1px rgba(0,0,0,.25)',
          backdropFilter: 'blur(18px)',
          minWidth: 240,
        }}
      >
        <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))', color: '#fff' }}>
          <Icon size={24} />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-muted uppercase tracking-wider font-semibold">
            <DeviceIcon size={11} />{p.device} · {caption}
          </div>
          <div className="flex items-baseline gap-1.5">
            {p.swatch && (
              <span className="h-5 w-5 rounded-full shrink-0 self-center mr-0.5" style={{ background: p.swatch === 'multi' ? 'conic-gradient(#ff3b30,#ffcc00,#34c759,#00c7be,#007aff,#af52de,#ff3b30)' : p.swatch, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)' }} />
            )}
            <span className={`${value.length > 11 ? 'text-[22px]' : 'text-[28px]'} leading-8 font-bold tabular-nums whitespace-nowrap`}>{value}</span>
            {p.unit && <span className="text-sm text-muted font-semibold">{p.unit}</span>}
          </div>
          {p.count != null && p.stage != null && p.count > 1 && (
            <div className="flex gap-1.5 mt-1">
              {Array.from({ length: p.count }, (_, i) => (
                <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === p.stage ? 18 : 6, background: i === p.stage ? 'var(--color-accent)' : 'var(--color-line-2)' }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
