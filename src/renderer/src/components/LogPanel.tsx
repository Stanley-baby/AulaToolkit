import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore, useT } from '../store';
import { Card } from './ui';

export const LogPanel = () => {
  const t = useT();
  const log = useStore((s) => s.log);
  const clear = useStore((s) => s.clearLog);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [log.length]);
  const color: Record<string, string> = { '→': 'var(--color-accent-2)', '⇢': 'var(--color-accent-2)', '←': 'var(--color-ok)', '⇠': 'var(--color-ok)', '!': 'var(--color-danger)', i: 'var(--color-muted)' };
  return (
    <Card title={t('log')} right={<button className="btn btn-sm" onClick={() => void clear()}><Trash2 size={14} />{t('clearLog')}</button>}>
      <p className="text-xs text-muted mb-3">{t('logHint')}</p>
      <div className="font-mono text-[11px] leading-5 h-[60vh] overflow-y-auto rounded-xl p-3 select-text" style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-line)' }}>
        {log.map((e, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-muted shrink-0">{new Date(e.t).toLocaleTimeString()}</span>
            <span className="shrink-0 w-14 text-muted truncate">{e.device ?? ''}</span>
            <span style={{ color: color[e.dir] }}>{e.dir}</span>
            <span className="break-all">{e.text}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
    </Card>
  );
};
