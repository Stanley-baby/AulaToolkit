import { useEffect, useMemo, useRef, useState } from 'react';
import { interpolate } from '@shared/colorInterp';
import { Paintbrush, Eraser, PaintBucket } from 'lucide-react';
import { modelById } from '@shared/models';
import { USER_LIGHT_MODE } from '@shared/protocols/aula04';
import { activeProfile, useStore, useT, useTn } from '../../store';
import { Card, ColorField, Segmented, Slider, Toggle, rgbToHex, Select } from '../ui';
import { KeyboardView } from './KeyboardView';
import { imageFor } from '../../assets';
import { useEffectPreview } from '../../effects';

const CAP = { BRIGHTNESS: 1, SPEED: 2, DIR_LR: 4, DIR_UD: 8, COLORFUL: 16, COLOR: 32 };

type Rgb = [number, number, number];

/**
 * Playback delay for live readings. They arrive about every 160 ms with some jitter; drawing slightly
 * in the past lets every screen frame sit between two known readings, so the motion stays smooth.
 */
const LIVE_DELAY_MS = 240;

/**
 * Live LED colours for the screen, interpolated at display rate between the readings and scaled up.
 * At low brightness the keyboard reports dim values (a peak of ~47 at level 1) that look washed out
 * over the photo; the gain follows the brightest reading of the last few seconds, so breathing and
 * fading effects keep their shape.
 */
function useLiveColors(live: { colors: Record<number, Rgb>; at: number } | undefined): Record<number, Rgb> | undefined {
  const frames = useRef<{ t: number; colors: Record<number, Rgb>; peak: number }[]>([]);
  const [out, setOut] = useState<Record<number, Rgb> | undefined>(undefined);

  useEffect(() => {
    if (!live) return;
    const list = frames.current;
    if (list.length && list[list.length - 1].t >= live.at) return;
    if (list.length && live.at - list[list.length - 1].t > 2000) list.length = 0; // readings paused (window hidden)
    let peak = 0;
    for (const c of Object.values(live.colors)) peak = Math.max(peak, c[0], c[1], c[2]);
    list.push({ t: live.at, colors: live.colors, peak });
    if (list.length > 16) list.shift();
  }, [live]);

  const active = !!live;
  useEffect(() => {
    if (!active) { setOut(undefined); return; }
    let raf = 0;
    const tick = (): void => {
      const list = frames.current;
      if (list.length) {
        const rt = Date.now() - LIVE_DELAY_MS;
        let i = list.findIndex((f) => f.t > rt);
        if (i === -1) i = list.length; // past the newest reading: hold it
        const ia = Math.max(0, i - 1);
        const a = list[ia], b = list[Math.min(list.length - 1, i)], before = ia > 0 ? list[ia - 1] : undefined;
        const k = b.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 1;
        const top = Math.max(...list.map((f) => f.peak));
        const gain = top > 0 ? Math.min(6, 255 / top) : 1;
        const next: Record<number, Rgb> = {};
        for (const key of Object.keys(b.colors)) {
          const code = Number(key);
          const cb = b.colors[code], ca = a.colors[code] ?? cb;
          const c = k >= 1 ? cb : interpolate(before?.colors[code], ca, cb, k);
          next[code] = [Math.min(255, Math.round(c[0] * gain)), Math.min(255, Math.round(c[1] * gain)), Math.min(255, Math.round(c[2] * gain))];
        }
        setOut(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return active ? out : undefined;
}

export const LightingPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const profile = useStore((s) => activeProfile(s, modelId));
  const update = useStore((s) => s.updateProfile);
  const [paint, setPaint] = useState<[number, number, number]>([255, 90, 31]);
  const [erase, setErase] = useState(false);
  const kb = profile?.keyboard;
  const modes = model.lightModes ?? [];
  const cur = useMemo(() => modes.find((m) => m.mode === kb?.lighting.mode), [modes, kb?.lighting.mode]);
  const simulated = useEffectPreview(kb?.lighting, model.layout ?? [], kb?.perKey);
  // Over USB the S75 Pro reports what its LEDs show right now; prefer that to the simulation.
  const device = useStore((s) => s.deviceFor(modelId));
  const deviceLight = useStore((s) => s.liveLight[modelId]);
  const liveColors = useLiveColors(device?.link === 'usb' ? deviceLight : undefined);
  if (!kb) return null;
  const perKey = kb.lighting.mode === USER_LIGHT_MODE;
  const caps = perKey ? CAP.BRIGHTNESS : cur?.caps ?? 0;
  const showLive = !!liveColors && device?.link === 'usb' && !perKey;

  const setL = (patch: Partial<typeof kb.lighting>): void => update(modelId, (p) => { if (p.keyboard) Object.assign(p.keyboard.lighting, patch); }, 'lighting');

  const paintKey = (code: number): void => update(modelId, (p) => {
    if (!p.keyboard) return;
    if (erase) delete p.keyboard.perKey[code]; else p.keyboard.perKey[code] = paint;
  }, 'perKey');

  const previewColors = showLive ? liveColors : simulated;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
      <div className="flex flex-col gap-5">
        <Card>
          <KeyboardView
            keys={model.layout ?? []}
            colors={previewColors}
            onKey={perKey ? paintKey : undefined}
            glow={perKey ? undefined : rgbToHex(kb.lighting.color)}
            dimUnpainted={perKey}
            photo={model.topImage ? { src: imageFor(model.topImage.id), width: model.topImage.width, height: model.topImage.height } : undefined}
          />
          {perKey && (
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <span className="text-xs text-muted">{t('paintHint')}</span>
              <div className="flex-1" />
              <Segmented value={erase ? 'erase' : 'paint'} onChange={(v) => setErase(v === 'erase')} options={[{ value: 'paint', label: <span className="flex items-center gap-1"><Paintbrush size={14} />{t('color')}</span> }, { value: 'erase', label: <span className="flex items-center gap-1"><Eraser size={14} />{t('clearAll')}</span> }]} />
              <button className="btn btn-sm" onClick={() => update(modelId, (p) => { if (p.keyboard) p.keyboard.perKey = Object.fromEntries((model.layout ?? []).map((k) => [k.code, paint])); }, 'perKey')}><PaintBucket size={14} />{t('fillAll')}</button>
              <button className="btn btn-sm" onClick={() => update(modelId, (p) => { if (p.keyboard) p.keyboard.perKey = {}; }, 'perKey')}><Eraser size={14} />{t('clearAll')}</button>
            </div>
          )}
        </Card>
        <Card title={t('effect')}>
          <div className="flex flex-wrap gap-1.5">
            {[...modes, { mode: USER_LIGHT_MODE, name: t('perKey'), caps: 1 }].map((m) => (
              <button
                key={m.mode}
                onClick={() => setL({ mode: m.mode })}
                className="rounded-full px-3 py-1.5 text-[13px] transition-all flex items-center gap-1.5 whitespace-nowrap"
                style={{
                  background: kb.lighting.mode === m.mode ? 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 35%, var(--color-panel-2)), var(--color-panel-2))' : 'var(--color-bg-2)',
                  border: `1px solid ${kb.lighting.mode === m.mode ? 'var(--color-accent)' : 'var(--color-line)'}`,
                }}
              >
                {m.mode === USER_LIGHT_MODE ? <Paintbrush size={13} /> : null}
                {tn(m.name)}
              </button>
            ))}
          </div>
        </Card>
      </div>
      <div className="flex flex-col gap-5">
        <Card title={perKey ? t('perKey') : tn(cur?.name ?? '') || t('lighting')}>
          {perKey && <ColorField value={paint} onChange={setPaint} label={t('color')} />}
          {!!(caps & CAP.COLOR) && !kb.lighting.colorful && <ColorField value={kb.lighting.color} onChange={(c) => setL({ color: c })} label={t('color')} />}
          {!!(caps & CAP.COLORFUL) && <Toggle on={kb.lighting.colorful} onChange={(v) => setL({ colorful: v })} label={t('colorful')} />}
          {!!(caps & CAP.BRIGHTNESS) && <Slider label={t('brightness')} min={0} max={model.lightRange?.brightness ?? 5} value={kb.lighting.brightness} onChange={(v) => setL({ brightness: v })} />}
          {!!(caps & CAP.SPEED) && <Slider label={t('speed')} min={0} max={model.lightRange?.speed ?? 5} value={kb.lighting.speed} onChange={(v) => setL({ speed: v })} />}
          {!!(caps & (CAP.DIR_LR | CAP.DIR_UD)) && (
            <div className="py-2 flex items-center justify-between">
              <span className="text-sm">{t('direction')}</span>
              <Segmented
                value={kb.lighting.direction}
                onChange={(v) => setL({ direction: v })}
                options={[
                  ...(caps & CAP.DIR_LR ? [{ value: 0, label: t('left') }, { value: 1, label: t('right') }] : []),
                  ...(caps & CAP.DIR_UD ? [{ value: 2, label: t('up') }, { value: 3, label: t('down') }] : []),
                ]}
              />
            </div>
          )}
        </Card>
        {model.features.bar && model.barModes && (
          <Card title={t('sideBar')}>
            <Select
              value={kb.barMode ?? model.barModes[0].mode}
              options={model.barModes.map((b) => ({ value: b.mode, label: tn(b.name) }))}
              onChange={(v) => update(modelId, (p) => { if (p.keyboard) p.keyboard.barMode = v; }, 'bar')}
            />
          </Card>
        )}
      </div>
    </div>
  );
};
