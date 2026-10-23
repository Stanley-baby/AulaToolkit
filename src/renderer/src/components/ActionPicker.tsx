import { useEffect, useState } from 'react';
import type { KeyAction, Macro } from '@shared/types';
import { MEDIA_ACTIONS, MODIFIERS, MOUSE_ACTIONS, SHORTCUTS, hidFromDomCode, hidName, isModifier, modifierBit, modsLabel } from '@shared/keycodes';
import { MACRO_PLAY_MODES } from '@shared/protocols/aula04';
import { useStore, useT } from '../store';
import { Segmented, Select } from './ui';

type Kind = 'default' | 'key' | 'mouse' | 'media' | 'shortcut' | 'macro' | 'disable' | 'dpi' | 'fire' | 'profile';

interface Props {
  value: KeyAction | undefined;
  onChange: (a: KeyAction) => void;
  macros: Macro[];
  /** Which action families this device supports. */
  kinds: Kind[];
  /** Mouse macro loop modes differ from keyboard ones. */
  macroModes?: string[];
}

export function describeAction(a: KeyAction | undefined, macros: Macro[], t: (k: never) => string): string {
  const tn = useStore.getState().tn;
  switch (a?.type) {
    case undefined: case 'default': return t('defaultKey' as never);
    case 'disable': return t('disableKey' as never);
    case 'key': return [modsLabel(a.mods), isModifier(a.code) ? hidName(a.code) : hidName(a.code)].filter(Boolean).join(' + ');
    case 'mouse': return tn(MOUSE_ACTIONS.find((m) => m.id === a.id)?.name ?? 'Mouse');
    case 'media': return tn(MEDIA_ACTIONS.find((m) => m.usage === a.usage)?.name ?? `Media 0x${a.usage.toString(16)}`);
    case 'macro': return `${t('macro' as never)}: ${macros[a.index]?.name ?? `#${a.index + 1}`}`;
    case 'dpi': return `DPI ${a.op === 'cycle' ? '⟳' : a.op === 'up' ? '+' : '−'}`;
    case 'fire': return t('fireKey' as never);
    case 'profile': return t('profileSwitch' as never);
  }
}

export const ActionPicker = ({ value, onChange, macros, kinds, macroModes }: Props) => {
  const t = useT();
  const tn = useStore((s) => s.tn);
  const initial: Kind = value?.type === 'key' ? (SHORTCUTS.some((s) => s.code === value.code && s.mods === value.mods) ? 'shortcut' : 'key') : (value?.type ?? 'default');
  const [kind, setKind] = useState<Kind>(kinds.includes(initial) ? initial : kinds[0]);
  const [capturing, setCapturing] = useState(false);
  const [mods, setMods] = useState(value?.type === 'key' ? value.mods : 0);
  const [code, setCode] = useState(value?.type === 'key' ? value.code : 0);

  useEffect(() => {
    if (!capturing) return;
    const h = (e: KeyboardEvent): void => {
      e.preventDefault(); e.stopPropagation();
      const hid = hidFromDomCode(e.code);
      if (!hid) return;
      if (isModifier(hid)) { setMods((m) => m | modifierBit(hid)); return; }
      setCode(hid);
      setCapturing(false);
      onChange({ type: 'key', code: hid, mods });
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [capturing, mods, onChange]);

  const labels: Record<Kind, string> = {
    default: t('defaultKey'), key: t('keyFunction'), mouse: t('mouseFunction'), media: t('media'), shortcut: t('shortcut'),
    macro: t('macro'), disable: t('disableKey'), dpi: t('dpiAction'), fire: t('fireKey'), profile: t('profileSwitch'),
  };

  const pick = (k: Kind): void => {
    setKind(k);
    if (k === 'default') onChange({ type: 'default' });
    if (k === 'disable') onChange({ type: 'disable' });
    if (k === 'fire') onChange({ type: 'fire' });
    if (k === 'profile') onChange({ type: 'profile' });
    if (k === 'dpi') onChange({ type: 'dpi', op: 'cycle' });
    if (k === 'mouse') onChange({ type: 'mouse', id: 1 });
    if (k === 'media') onChange({ type: 'media', usage: MEDIA_ACTIONS[0].usage });
    if (k === 'shortcut') onChange({ type: 'key', code: SHORTCUTS[0].code, mods: SHORTCUTS[0].mods });
    if (k === 'macro') onChange({ type: 'macro', index: 0, mode: 0, loops: 1 });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {kinds.map((k) => (
          <button key={k} className="chip" style={kind === k ? { color: 'var(--color-accent-2)', borderColor: 'var(--color-accent)' } : undefined} onClick={() => pick(k)}>{labels[k]}</button>
        ))}
      </div>

      {kind === 'key' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {MODIFIERS.slice(0, 4).map(([n, bit]) => (
              <button key={n} className="chip" style={mods & bit ? { color: 'var(--color-accent-2)', borderColor: 'var(--color-accent)' } : undefined} onClick={() => { const m = mods ^ bit; setMods(m); if (code) onChange({ type: 'key', code, mods: m }); }}>{n}</button>
            ))}
          </div>
          <button className="btn" style={capturing ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent-2)' } : undefined} onClick={() => setCapturing(true)}>
            {capturing ? t('pressKey') : code ? [modsLabel(mods), hidName(code)].filter(Boolean).join(' + ') : t('pressKey')}
          </button>
        </div>
      )}

      {kind === 'mouse' && (
        <Select value={value?.type === 'mouse' ? value.id : 1} options={MOUSE_ACTIONS.map((m) => ({ value: m.id, label: tn(m.name) }))} onChange={(id) => onChange({ type: 'mouse', id })} />
      )}
      {kind === 'media' && (
        <Select value={value?.type === 'media' ? value.usage : MEDIA_ACTIONS[0].usage} options={MEDIA_ACTIONS.map((m) => ({ value: m.usage, label: tn(m.name) }))} onChange={(usage) => onChange({ type: 'media', usage })} />
      )}
      {kind === 'shortcut' && (
        <Select
          value={value?.type === 'key' ? `${value.mods}:${value.code}` : `${SHORTCUTS[0].mods}:${SHORTCUTS[0].code}`}
          options={SHORTCUTS.map((s) => ({ value: `${s.mods}:${s.code}`, label: tn(s.name) }))}
          onChange={(v) => { const [m, c] = v.split(':').map(Number); onChange({ type: 'key', code: c, mods: m }); }}
        />
      )}
      {kind === 'dpi' && (
        <Segmented value={value?.type === 'dpi' ? value.op : 'cycle'} onChange={(op) => onChange({ type: 'dpi', op })} options={[{ value: 'cycle', label: 'DPI ⟳' }, { value: 'up', label: 'DPI +' }, { value: 'down', label: 'DPI −' }]} />
      )}
      {kind === 'macro' && (
        macros.length ? (
          <div className="flex flex-col gap-2">
            <Select value={value?.type === 'macro' ? value.index : 0} options={macros.map((m, i) => ({ value: i, label: m.name }))} onChange={(index) => onChange({ type: 'macro', index, mode: value?.type === 'macro' ? value.mode : 0, loops: value?.type === 'macro' ? value.loops : 1 })} />
            <Select label={t('playMode')} value={value?.type === 'macro' ? value.mode : 0} options={(macroModes ?? MACRO_PLAY_MODES).map((m, i) => ({ value: i, label: tn(m) }))} onChange={(mode) => onChange({ type: 'macro', index: value?.type === 'macro' ? value.index : 0, mode, loops: value?.type === 'macro' ? value.loops : 1 })} />
            {value?.type === 'macro' && (value.mode === 1 || (macroModes && value.mode === 2)) && (
              <label className="flex items-center justify-between gap-3 py-1"><span className="text-sm">{t('loops')}</span><input type="number" min={1} max={255} className="input w-24" value={value.loops ?? 1} onChange={(e) => onChange({ ...value, loops: Number(e.target.value) })} /></label>
            )}
          </div>
        ) : <div className="text-xs text-muted">{t('noMacros')}</div>
      )}
    </div>
  );
};
