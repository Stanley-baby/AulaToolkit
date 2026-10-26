import { useEffect, useMemo, useRef, useState } from 'react';
import { Cable, UploadCloud } from 'lucide-react';
import { modelById } from '@shared/models';
import { rgb565 } from '@shared/protocols/aula04';
import { fitFrames } from '@shared/screenFrames';
import type { StoredScreen } from '@shared/ipc';
import type { ScreenFrame } from '@shared/types';
import { CENTRE, cropRoom, decodeImage, drawInto, thumbnail, type CropPos, type DecodedFrame, type FitMode } from '../../media';
import { useStore, useT } from '../../store';
import { Card, Segmented, Slider } from '../ui';
import { LibraryGrid, type Picked } from '../LibraryGrid';

interface Shown { name: string; dataUrl: string; frames: DecodedFrame[]; libraryId?: string }

// official driver always sends slot 1 and keeps frames at 30-500 ms, do the same
const SLOT = 1;
const MIN_DELAY_MS = 30;
const MAX_DELAY_MS = 500;

export const ScreenPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const model = modelById(modelId)!;
  const call = useStore((s) => s.call);
  const dev = useStore((s) => s.deviceFor(modelId));
  const toast = useStore((s) => s.toast);
  const busy = useStore((s) => !!s.busy[`${modelId}:uploadScreen`]);
  const scr = model.screen!;
  const [img, setImg] = useState<Shown | null>(null);
  // false while a newly picked picture is not uploaded yet
  const [saved, setSaved] = useState(true);
  const [mode, setMode] = useState<FitMode>('cover');
  const [pos, setPos] = useState<CropPos>(CENTRE);
  const drag = useRef<{ px: number; py: number; pos: CropPos } | null>(null);
  const [count, setCount] = useState(scr.maxFrames);
  const [pct, setPct] = useState<number | null>(null);
  const [frame, setFrame] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    void window.aula.loadScreen(modelId, SLOT).then(async (st) => {
      const frames = st ? await decodeImage(st.dataUrl).catch(() => null) : null;
      if (!alive) return;
      setImg(st && frames ? { name: st.name, dataUrl: st.dataUrl, frames } : null);
      if (st) { setMode(st.mode); setCount(st.frames); setPos(st.pos ?? CENTRE); }
      setSaved(true);
      setFrame(0);
    });
    return () => { alive = false; };
  }, [modelId]);

  useEffect(() => window.aula.onProgress((p) => {
    if (p.modelId === modelId && p.task === 'screen') setPct(Math.floor((p.done * 100) / p.total));
  }), [modelId]);

  const pick = async (p: Picked): Promise<void> => {
    try {
      const frames = p.frames ?? await decodeImage(p.dataUrl);
      setImg({ name: p.item.name, dataUrl: p.dataUrl, frames, libraryId: p.item.id });
      setCount(scr.maxFrames);
      setPos(CENTRE);
      setSaved(false);
      setFrame(0);
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const limit = img ? Math.min(img.frames.length, scr.maxFrames) : 1;
  const n = Math.max(1, Math.min(count, limit));
  const plan = useMemo(() => (img
    ? fitFrames(img.frames, n, MIN_DELAY_MS).map((x) => ({ bitmap: img.frames[x.index].bitmap, delayMs: Math.min(MAX_DELAY_MS, x.delayMs) }))
    : []), [img, n]);

  // Preview animation
  useEffect(() => {
    if (!plan.length) { setFrame(0); return; }
    let i = 0; let timer = 0;
    const tick = (): void => { setFrame(i); timer = window.setTimeout(() => { i = (i + 1) % plan.length; tick(); }, plan[i]?.delayMs ?? 100); };
    tick();
    return () => window.clearTimeout(timer);
  }, [plan]);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    drawInto(c.getContext('2d')!, plan[frame]?.bitmap, scr.width, scr.height, mode, pos);
  }, [plan, frame, mode, pos, scr.width, scr.height]);

  // cover: drag the preview to move the crop
  const SCALE = 1.6;
  const room = img && mode === 'cover' ? cropRoom(img.frames[0].bitmap, scr.width, scr.height) : { x: 0, y: 0 };
  const movable = room.x > 0.5 || room.y > 0.5;
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!movable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, pos };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const d = drag.current;
    if (!d) return;
    const clamp = (v: number): number => Math.max(0, Math.min(1, v));
    setPos({
      x: room.x > 0 ? clamp(d.pos.x - (e.clientX - d.px) / (room.x * SCALE)) : 0.5,
      y: room.y > 0 ? clamp(d.pos.y - (e.clientY - d.py) / (room.y * SCALE)) : 0.5,
    });
    setSaved(false);
  };
  const onUp = (): void => { drag.current = null; };

  const upload = async (): Promise<void> => {
    if (!img) return;
    setPct(0);
    try {
      const off = new OffscreenCanvas(scr.width, scr.height);
      const ctx = off.getContext('2d')!;
      const frames: ScreenFrame[] = [];
      for (const f of plan) {
        drawInto(ctx, f.bitmap, scr.width, scr.height, mode, pos);
        frames.push({ pixels: rgb565(ctx.getImageData(0, 0, scr.width, scr.height).data, scr.width, scr.height), delayMs: f.delayMs });
      }
      await call(modelId, 'uploadScreen', frames, SLOT);
      const stored: StoredScreen = { name: img.name, dataUrl: img.dataUrl, mode, frames: n, thumb: thumbnail(img.frames[0].bitmap), pos };
      await window.aula.saveScreen(modelId, SLOT, stored);
      setSaved(true);
      toast(t('applied'), 'ok');
    } catch {
      // call() has already shown the error
    } finally {
      setPct(null);
    }
  };

  const uploading = busy || pct !== null;
  const wireless = !!dev && dev.link !== 'usb';
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
      <Card title={t('screenTitle')}>
        <div className="flex justify-center">
          <div className="rounded-2xl p-3" style={{ background: '#000', border: '6px solid #1c1f27', boxShadow: '0 20px 50px -20px #000' }}>
            <canvas
              ref={canvas} width={scr.width} height={scr.height}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ width: scr.width * SCALE, height: scr.height * SCALE, background: '#000', display: 'block', outline: '1px solid #2a2f3a', cursor: movable ? (drag.current ? 'grabbing' : 'grab') : undefined, touchAction: 'none' }}
            />
          </div>
        </div>
        <div className="flex justify-center mt-4">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'cover', label: t('cover') }, { value: 'fit', label: t('fit') }]} />
        </div>
        <div className="text-xs text-muted text-center mt-3">{scr.width} × {scr.height} · {img ? `${plan.length} ${t('frames')}` : '—'}</div>
      </Card>

      <div className="flex flex-col gap-5 min-w-0">
        <Card>
          {img && limit > 1 && <Slider label={t('frames')} min={1} max={limit} value={n} onChange={setCount} />}
          <div className={`flex items-center gap-3 ${img && limit > 1 ? 'mt-3' : ''}`}>
            {wireless
              ? <div className="flex items-center gap-2 text-sm flex-1" style={{ color: 'var(--color-warn)' }}><Cable size={16} className="shrink-0" />{t('needsCable')}</div>
              : <div className="text-sm text-muted truncate flex-1">{img && !saved ? img.name : ''}</div>}
            <button className="btn btn-primary shrink-0" style={{ minWidth: 150 }} disabled={!dev || wireless || !img || uploading} onClick={() => void upload()}>
              <UploadCloud size={15} />{uploading ? `${pct ?? 0}%` : t('upload')}
            </button>
          </div>
        </Card>

        <LibraryGrid selectedId={img && !saved ? img.libraryId : undefined} onPick={(p) => void pick(p)} disabled={uploading} />
      </div>
    </div>
  );
};
