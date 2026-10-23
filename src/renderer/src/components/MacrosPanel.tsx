import { useEffect, useRef, useState } from 'react';
import { Circle, Clock, Plus, Square, Trash2, X } from 'lucide-react';
import { modelById } from '@shared/models';
import type { Macro, MacroStep } from '@shared/types';
import { hidFromDomCode, hidName } from '@shared/keycodes';
import { useStore, useT } from '../store';
import { Card } from './ui';

const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const MacrosPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const model = modelById(modelId)!;
  void model;
  const macros = useStore((s) => s.settings[modelId]?.macros ?? []);
  const setMacros = useStore((s) => s.setMacros);
  const [selId, setSelId] = useState<string | null>(macros[0]?.id ?? null);
  const [recording, setRecording] = useState(false);
  const lastT = useRef(0);
  const sel = macros.find((m) => m.id === selId) ?? null;

  const patch = (id: string, fn: (m: Macro) => void): void => {
    setMacros(modelId, macros.map((m) => { if (m.id !== id) return m; const c = structuredClone(m); fn(c); return c; }));
  };

  useEffect(() => {
    if (!recording || !sel) return;
    const push = (step: MacroStep): void => {
      const now = performance.now();
      const gap = lastT.current ? Math.round(now - lastT.current) : 0;
      lastT.current = now;
      patch(sel.id, (m) => { if (gap >= 5) m.steps.push({ kind: 'delay', ms: gap }); m.steps.push(step); });
    };
    const down = (e: KeyboardEvent): void => { const h = hidFromDomCode(e.code); if (!h || e.repeat) return; e.preventDefault(); push({ kind: 'KEY_DOWN', code: h }); };
    const up = (e: KeyboardEvent): void => { const h = hidFromDomCode(e.code); if (!h) return; e.preventDefault(); push({ kind: 'KEY_UP', code: h }); };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, sel?.id, macros]);

  const add = (): void => { const m: Macro = { id: newId(), name: `${t('macro')} ${macros.length + 1}`, steps: [] }; setMacros(modelId, [...macros, m]); setSelId(m.id); };
  const remove = (id: string): void => { setMacros(modelId, macros.filter((m) => m.id !== id)); if (selId === id) setSelId(null); };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
      <Card title={t('macros')} right={<button className="btn btn-sm" onClick={add}><Plus size={14} />{t('newMacro')}</button>}>
        <div className="flex flex-col gap-1">
          {macros.map((m, i) => (
            <button key={m.id} onClick={() => { setSelId(m.id); setRecording(false); }} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm" style={{ background: selId === m.id ? 'var(--color-panel-2)' : 'transparent', boxShadow: selId === m.id ? 'inset 0 0 0 1px var(--color-line-2)' : undefined }}>
              <span className="chip" style={{ padding: '0 6px' }}>M{i + 1}</span>
              <span className="truncate flex-1">{m.name}</span>
              <span className="text-xs text-muted">{m.steps.length}</span>
            </button>
          ))}
          {!macros.length && <div className="text-sm text-muted py-4 text-center">{t('noMacros')}</div>}
        </div>
      </Card>
      <Card
        title={sel ? <input className="input" value={sel.name} onChange={(e) => patch(sel.id, (m) => { m.name = e.target.value; })} /> : t('macroEditor')}
        right={sel && (
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={() => patch(sel.id, (m) => m.steps.push({ kind: 'delay', ms: 100 }))}><Clock size={14} />{t('addDelay')}</button>
            <button className="btn btn-sm" onClick={() => patch(sel.id, (m) => { m.steps = []; })}><X size={14} />{t('clear')}</button>
            <button className={`btn btn-sm ${recording ? '' : 'btn-primary'}`} style={recording ? { borderColor: 'var(--color-danger)', color: 'var(--color-danger)' } : undefined} onClick={() => { lastT.current = 0; setRecording(!recording); }}>
              {recording ? <Square size={14} /> : <Circle size={14} />}{recording ? t('stopRecording') : t('record')}
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => remove(sel.id)}><Trash2 size={15} /></button>
          </div>
        )}
      >
        {sel ? (
          <>
            <div className="text-xs text-muted mb-3">{t('recordHint')}</div>
            <div className="flex flex-wrap gap-1.5 min-h-24 rounded-xl p-3" style={{ background: 'var(--color-bg-2)', border: `1px solid ${recording ? 'var(--color-danger)' : 'var(--color-line)'}` }}>
              {sel.steps.map((s, i) => (
                <StepChip key={i} step={s} onChange={(ns) => patch(sel.id, (m) => { m.steps[i] = ns; })} onRemove={() => patch(sel.id, (m) => { m.steps.splice(i, 1); })} />
              ))}
              {!sel.steps.length && <span className="text-xs text-muted self-center">{t('steps')}: 0</span>}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted">{t('noMacros')}</div>
        )}
      </Card>
    </div>
  );
};

const StepChip = ({ step, onChange, onRemove }: { step: MacroStep; onChange: (s: MacroStep) => void; onRemove: () => void }) => {
  if (step.kind === 'delay') {
    return (
      <span className="chip" style={{ color: 'var(--color-warn)' }}>
        <Clock size={11} />
        <input className="bg-transparent w-12 outline-none text-right font-mono" value={step.ms ?? 0} onChange={(e) => onChange({ kind: 'delay', ms: Math.max(0, Number(e.target.value) || 0) })} />
        ms
        <button onClick={onRemove} className="opacity-60 hover:opacity-100"><X size={11} /></button>
      </span>
    );
  }
  const down = step.kind.endsWith('DOWN');
  const name = step.kind.startsWith('MOUSE') ? { 1: 'LMB', 2: 'RMB', 4: 'MMB' }[step.code ?? 0] ?? 'Mouse' : hidName(step.code ?? 0);
  return (
    <span className="chip" style={{ color: down ? 'var(--color-ok)' : 'var(--color-muted)' }}>
      {down ? '↓' : '↑'} {name}
      <button onClick={onRemove} className="opacity-60 hover:opacity-100"><X size={11} /></button>
    </span>
  );
};
