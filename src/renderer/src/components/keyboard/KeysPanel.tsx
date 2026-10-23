import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { modelById } from '@shared/models';
import type { KeyAction } from '@shared/types';
import { activeProfile, useStore, useT } from '../../store';
import { Card, Segmented } from '../ui';
import { KeyboardView } from './KeyboardView';
import { ActionPicker, describeAction } from '../ActionPicker';

export const KeysPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const model = modelById(modelId)!;
  const profile = useStore((s) => activeProfile(s, modelId));
  const macros = useStore((s) => s.settings[modelId]?.macros ?? []);
  const update = useStore((s) => s.updateProfile);
  const [layer, setLayer] = useState<'base' | 'fn'>('base');
  const [sel, setSel] = useState<number | null>(null);
  const kb = profile?.keyboard;
  if (!kb) return null;
  const map = layer === 'fn' ? kb.fnKeymap : kb.keymap;
  const keyDef = model.layout?.find((k) => k.code === sel);

  const labels = Object.fromEntries(Object.entries(map).map(([code, a]) => [code, shortLabel(a as KeyAction)]));
  const colors = Object.fromEntries(Object.keys(map).filter((c) => (map as Record<string, KeyAction>)[c].type !== 'default').map((c) => [c, [255, 90, 31] as [number, number, number]]));

  const setAction = (a: KeyAction): void => {
    if (sel === null) return;
    update(modelId, (p) => {
      if (!p.keyboard) return;
      const m = layer === 'fn' ? p.keyboard.fnKeymap : p.keyboard.keymap;
      if (a.type === 'default') delete m[sel]; else m[sel] = a;
    }, layer === 'fn' ? 'fnKeymap' : 'keymap');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5">
      <Card
        title={layer === 'fn' ? t('fnLayer') : t('baseLayer')}
        right={
          <div className="flex items-center gap-2">
            {model.features.fnLayer && <Segmented value={layer} onChange={(v) => { setLayer(v); setSel(null); }} options={[{ value: 'base', label: t('baseLayer') }, { value: 'fn', label: t('fnLayer') }]} />}
            <button className="btn btn-sm" onClick={() => update(modelId, (p) => { if (p.keyboard) { if (layer === 'fn') p.keyboard.fnKeymap = {}; else p.keyboard.keymap = {}; } }, layer === 'fn' ? 'fnKeymap' : 'keymap')}><RotateCcw size={14} />{t('reset')}</button>
          </div>
        }
      >
        <KeyboardView keys={model.layout ?? []} colors={colors} labels={labels} selected={sel !== null ? new Set([sel]) : undefined} onKey={(c) => setSel(c)} />
        <div className="text-xs text-muted mt-3">{t('pickKeys')}</div>
      </Card>
      <Card title={keyDef ? `${keyDef.name} → ${describeAction(map[keyDef.code], macros, t as never)}` : t('assign')}>
        {keyDef ? (
          <ActionPicker key={`${layer}:${keyDef.code}`} value={map[keyDef.code]} onChange={setAction} macros={macros} kinds={['default', 'key', 'shortcut', 'mouse', 'media', 'macro', 'disable']} />
        ) : (
          <div className="text-sm text-muted">{t('pickKeys')}</div>
        )}
      </Card>
    </div>
  );
};

function shortLabel(a: KeyAction): string {
  switch (a.type) {
    case 'disable': return '✕';
    case 'key': return '⌨';
    case 'mouse': return '🖱';
    case 'media': return '♪';
    case 'macro': return `M${a.index + 1}`;
    default: return '';
  }
}
