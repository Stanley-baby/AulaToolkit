import { Minus, X, Settings, RefreshCw } from 'lucide-react';
import { useStore, useT } from '../store';
import { Wordmark } from './Wordmark';

export const TitleBar = () => {
  const t = useT();
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  return (
    <header className="drag flex items-center h-11 px-4 gap-3 shrink-0" style={{ borderBottom: '1px solid var(--color-line)', background: 'color-mix(in srgb, var(--color-bg) 80%, transparent)' }}>
      <div className="flex items-center gap-2.5">
        <Wordmark size={15} logo />
      </div>
      <div className="flex-1" />
      <div className="no-drag flex items-center gap-1">
        <button className="btn btn-ghost btn-icon" title={t('rescan')} onClick={() => void window.aula.rescan()}><RefreshCw size={16} /></button>
        <button className="btn btn-ghost btn-icon" title={t('settings')} onClick={() => setPage(page === 'settings' ? 'device' : 'settings')} style={page === 'settings' ? { color: 'var(--color-accent-2)' } : undefined}><Settings size={16} /></button>
        <span className="w-2" />
        <button className="btn btn-ghost btn-icon" title={t('minimize')} onClick={() => window.aula.minimize()}><Minus size={16} /></button>
        <button className="btn btn-ghost btn-icon hover:text-white" title={t('close')} onClick={() => window.aula.close()} style={{ ['--hover' as string]: 'var(--color-danger)' }}><X size={16} /></button>
      </div>
    </header>
  );
};
