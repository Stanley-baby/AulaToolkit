import { useEffect, useRef, useState } from 'react';
import { Film, ImagePlus, X } from 'lucide-react';
import type { LibraryItem } from '@shared/ipc';
import { addFromFile, type DecodedFrame } from '../media';
import { useStore, useT } from '../store';
import { Card } from './ui';

export interface Picked { item: LibraryItem; dataUrl: string; frames?: DecodedFrame[] }

// cache for hover playback
const playing = new Map<string, string>();

export const LibraryGrid = ({ selectedId, onPick, disabled, bare }: { selectedId?: string; onPick: (p: Picked) => void; disabled?: boolean; bare?: boolean }) => {
  const t = useT();
  const toast = useStore((s) => s.toast);
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [hover, setHover] = useState<{ id: string; src: string } | null>(null);
  const under = useRef<string | null>(null);
  const enter = async (it: LibraryItem): Promise<void> => {
    under.current = it.id;
    if (it.frames < 2) return;
    const src = playing.get(it.id) ?? await window.aula.libraryGet(it.id);
    if (!src) return;
    playing.set(it.id, src);
    if (under.current === it.id) setHover({ id: it.id, src }); // mouse may have left already
  };
  const leave = (it: LibraryItem): void => {
    if (under.current === it.id) under.current = null;
    setHover((h) => (h?.id === it.id ? null : h));
  };
  const load = (): Promise<void> => window.aula.libraryList().then(setItems);
  useEffect(() => { void load(); }, []);

  const add = async (): Promise<void> => {
    try {
      const r = await addFromFile();
      if (!r) return;
      await load();
      onPick(r);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const pick = async (item: LibraryItem): Promise<void> => {
    const dataUrl = await window.aula.libraryGet(item.id);
    if (dataUrl) onPick({ item, dataUrl });
  };
  const remove = async (item: LibraryItem): Promise<void> => {
    await window.aula.libraryDelete(item.id);
    await load();
  };

  const addButton = <button className="btn btn-sm" disabled={disabled} onClick={() => void add()}><ImagePlus size={14} />{t('libraryAdd')}</button>;
  const body = (
    <>
      {items && !items.length && (
        <button className="w-full rounded-xl py-8 text-sm text-muted flex flex-col items-center gap-2" style={{ border: '1px dashed var(--color-line)' }} disabled={disabled} onClick={() => void add()}>
          <ImagePlus size={22} />{t('libraryEmpty')}
        </button>
      )}
      {!!items?.length && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
          {items.map((it) => (
            <div key={it.id} className="group relative" onMouseEnter={() => void enter(it)} onMouseLeave={() => leave(it)}>
              <button
                className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center transition-all"
                style={{ background: '#000', border: `2px solid ${it.id === selectedId ? 'var(--color-accent)' : 'var(--color-line)'}` }}
                disabled={disabled}
                title={it.name}
                onClick={() => void pick(it)}
              >
                {hover?.id === it.id
                  ? <img src={hover.src} alt="" className="max-w-full max-h-full object-contain" />
                  : it.thumb ? <img src={it.thumb} alt="" className="max-w-full max-h-full object-contain" /> : <Film size={20} className="text-muted" />}
              </button>
              {it.frames > 1 && <span className="absolute left-1.5 bottom-1.5 chip text-[10px] px-1.5 py-0" style={{ background: 'color-mix(in srgb, #000 70%, transparent)' }}>GIF · {it.frames}</span>}
              <button
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full items-center justify-center hidden group-hover:flex"
                style={{ background: 'var(--color-panel-2)', border: '1px solid var(--color-line)' }}
                title={t('libraryRemove')}
                disabled={disabled}
                onClick={() => void remove(it)}
              >
                <X size={12} />
              </button>
              <div className="text-[11px] text-muted truncate mt-1" title={it.name}>{it.name}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
  if (bare) return <div className="flex flex-col gap-3"><div className="flex items-center justify-between"><span className="text-sm">{t('library')}</span>{addButton}</div>{body}</div>;
  return (
    <Card title={t('library')} right={addButton}>
      <p className="text-sm text-muted mb-4">{t('libraryHint')}</p>
      {body}
    </Card>
  );
};
