import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { modelById } from '@shared/models';
import type { KeyAction } from '@shared/types';
import { imageFor } from '../../assets';
import { activeProfile, useStore, useT, useTn } from '../../store';
import { Card } from '../ui';
import { ActionPicker, describeAction } from '../ActionPicker';

const MOUSE_MACRO_MODES = ['Repeat until key released', 'Repeat until any key', 'Repeat N times'];

export const ButtonsPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const tn = useTn();
  const model = modelById(modelId)!;
  const profile = useStore((s) => activeProfile(s, modelId));
  const macros = useStore((s) => s.settings[modelId]?.macros ?? []);
  const update = useStore((s) => s.updateProfile);
  const variant = useStore((s) => s.settings[modelId]?.variant);
  const [sel, setSel] = useState<number | null>(null);
  const m = profile?.mouse;
  if (!m) return null;
  const slots = model.buttonSlots ?? [];
  const slot = slots.find((s) => s.slot === sel);

  const setAction = (a: KeyAction): void => {
    if (sel === null) return;
    update(modelId, (p) => { if (!p.mouse) return; if (a.type === 'default') delete p.mouse.buttons[sel]; else p.mouse.buttons[sel] = a; }, 'buttons');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
      <Card
        title={t('buttons')}
        right={
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={() => update(modelId, (p) => { if (p.mouse) p.mouse.buttons = {}; }, 'buttons')}><RotateCcw size={14} />{t('reset')}</button>
          </div>
        }
      >
        <div className="relative mx-auto" style={{ width: 420, height: 420, borderRadius: 24, background: 'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 68%)' }}>
          <img src={imageFor(model.variants?.find((v) => v.id === variant)?.image ?? model.image)} alt="" className="absolute inset-0 w-full h-full object-contain rounded-3xl" draggable={false} />
          {slots.map((s) => {
            const a = m.buttons[s.slot];
            const active = sel === s.slot;
            const onLeft = s.x < 50;
            return (
              <button
                key={s.slot}
                onClick={() => setSel(s.slot)}
                className="absolute flex items-center gap-2"
                style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%,-50%)' }}
              >
                <span className="h-4 w-4 rounded-full border-2" style={{ background: active ? 'var(--color-accent)' : a ? 'var(--color-accent-2)' : '#fff', borderColor: active ? '#fff' : 'var(--color-accent)', boxShadow: '0 0 0 3px rgba(255,90,31,.25)' }} />
                <span className="absolute whitespace-nowrap text-xs font-medium rounded-lg px-2 py-1" style={{ background: 'var(--color-panel)', border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-line)'}`, [onLeft ? 'right' : 'left']: '140%', color: 'var(--color-text)' }}>
                  {tn(s.name)}{a ? ` · ${describeAction(a, macros, t as never)}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
      <Card title={slot ? `${tn(slot.name)} → ${describeAction(m.buttons[slot.slot], macros, t as never)}` : t('assign')}>
        {slot ? (
          slot.locked ? <div className="text-sm text-muted">{tn(slot.name)}</div> : (
            <ActionPicker key={slot.slot} value={m.buttons[slot.slot]} onChange={setAction} macros={macros} kinds={['default', 'mouse', 'dpi', 'key', 'shortcut', 'media', 'macro', 'fire', 'profile', 'disable']} macroModes={MOUSE_MACRO_MODES} />
          )
        ) : (
          <div className="text-sm text-muted">{t('pickKeys')}</div>
        )}
      </Card>
    </div>
  );
};
