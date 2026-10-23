import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, UploadCloud, Clock } from 'lucide-react';
import { modelById } from '@shared/models';
import { rgb565 } from '@shared/protocols/aula04';
import type { ScreenFrame } from '@shared/types';
import { useStore, useT } from '../../store';
import { Card, Segmented, Slider } from '../ui';

interface Decoded { frames: { bitmap: ImageBitmap; delayMs: number }[]; name: string }

export const ScreenPanel = ({ modelId }: { modelId: string }) => {
  const t = useT();
  const model = modelById(modelId)!;
  const call = useStore((s) => s.call);
  const dev = useStore((s) => s.deviceFor(modelId));
  const toast = useStore((s) => s.toast);
  const busy = useStore((s) => !!s.busy[`${modelId}:uploadScreen`]);
  const [img, setImg] = useState<Decoded | null>(null);
  const [mode, setMode] = useState<'cover' | 'fit'>('cover');
  const [maxFrames, setMaxFrames] = useState(60);
  const [slot, setSlot] = useState(1);
  const [frame, setFrame] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scr = model.screen!;

  // Preview animation
  useEffect(() => {
    if (!img) return;
    let i = 0; let timer = 0;
    const tick = (): void => { setFrame(i); timer = window.setTimeout(() => { i = (i + 1) % Math.min(img.frames.length, maxFrames); tick(); }, Math.max(20, img.frames[i]?.delayMs ?? 100)); };
    tick();
    return () => window.clearTimeout(timer);
  }, [img, maxFrames]);

  useEffect(() => {
    const c = canvas.current; if (!c || !img) return;
    draw(c.getContext('2d')!, img.frames[frame]?.bitmap, scr.width, scr.height, mode);
  }, [img, frame, mode, scr.width, scr.height]);

  const choose = async (): Promise<void> => {
    const r = await window.aula.pickImage();
    if (!r) return;
    try { setImg({ ...(await decode(r.dataUrl)), name: r.name }); setFrame(0); } catch (e) { toast((e as Error).message, 'error'); }
  };

  const upload = async (): Promise<void> => {
    if (!img) return;
    const off = new OffscreenCanvas(scr.width, scr.height);
    const ctx = off.getContext('2d')!;
    const frames: ScreenFrame[] = [];
    const take = img.frames.slice(0, Math.min(maxFrames, scr.maxFrames));
    for (const f of take) {
      draw(ctx as unknown as CanvasRenderingContext2D, f.bitmap, scr.width, scr.height, mode);
      const data = ctx.getImageData(0, 0, scr.width, scr.height).data;
      frames.push({ pixels: rgb565(data, scr.width, scr.height), delayMs: f.delayMs });
    }
    await call(modelId, 'uploadScreen', frames, slot);
    toast(t('applied'), 'ok');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-5">
      <Card title={t('screenTitle')}>
        <div className="flex justify-center">
          <div className="rounded-2xl p-3" style={{ background: '#000', border: '6px solid #1c1f27', boxShadow: '0 20px 50px -20px #000' }}>
            <canvas ref={canvas} width={scr.width} height={scr.height} style={{ width: scr.width * 1.6, height: scr.height * 1.6, imageRendering: 'auto', background: '#000', display: 'block' }} />
          </div>
        </div>
        <div className="text-xs text-muted text-center mt-3">{scr.width} × {scr.height} · {img ? `${Math.min(img.frames.length, maxFrames)} ${t('frames')}` : '—'}</div>
      </Card>
      <div className="flex flex-col gap-5">
        <Card title={t('chooseImage')}>
          <p className="text-sm text-muted mb-4">{t('screenHint')}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="btn" onClick={() => void choose()}><ImageIcon size={15} />{t('chooseImage')}</button>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'cover', label: t('cover') }, { value: 'fit', label: t('fit') }]} />
            <Segmented value={slot} onChange={setSlot} options={[1, 2, 3].map((s) => ({ value: s, label: `${t('slot')} ${s}` }))} />
            <div className="flex-1" />
            <button className="btn btn-primary" disabled={!dev || dev.link !== 'usb' || !img || busy} onClick={() => void upload()}>{busy ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}{t('upload')}</button>
          </div>
          {img && img.frames.length > 1 && <Slider label={t('frames')} min={1} max={Math.min(img.frames.length, scr.maxFrames)} value={Math.min(maxFrames, img.frames.length)} onChange={setMaxFrames} />}
          {img && <div className="text-xs text-muted mt-2 font-mono truncate">{img.name}</div>}
          {dev && dev.link !== 'usb' && <div className="chip chip-warn mt-3">USB</div>}
        </Card>
        <Card title={t('syncClock')}>
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-muted" />
            <span className="text-sm text-muted flex-1">{new Date().toLocaleString()}</span>
            <button className="btn btn-sm" disabled={!dev} onClick={() => void call(modelId, 'syncTime', 1)}>{t('syncClock')}</button>
          </div>
        </Card>
      </div>
    </div>
  );
};

function draw(ctx: CanvasRenderingContext2D, bmp: ImageBitmap | undefined, w: number, h: number, mode: 'cover' | 'fit'): void {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (!bmp) return;
  const s = mode === 'cover' ? Math.max(w / bmp.width, h / bmp.height) : Math.min(w / bmp.width, h / bmp.height);
  const dw = bmp.width * s, dh = bmp.height * s;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

async function decode(dataUrl: string): Promise<Omit<Decoded, 'name'>> {
  const blob = await (await fetch(dataUrl)).blob();
  const frames: { bitmap: ImageBitmap; delayMs: number }[] = [];
  const ID = (globalThis as unknown as { ImageDecoder?: new (o: { data: ArrayBuffer; type: string }) => ImageDecoderLike }).ImageDecoder;
  if (ID && (blob.type === 'image/gif' || blob.type === 'image/webp')) {
    const dec = new ID({ data: await blob.arrayBuffer(), type: blob.type });
    await dec.tracks.ready;
    const n = dec.tracks.selectedTrack?.frameCount ?? 1;
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      frames.push({ bitmap: await createImageBitmap(image), delayMs: Math.max(20, Math.round((image.duration ?? 100000) / 1000)) });
      image.close();
    }
  } else {
    frames.push({ bitmap: await createImageBitmap(blob), delayMs: 1000 });
  }
  return { frames };
}

interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(o: { frameIndex: number }): Promise<{ image: VideoFrame & { duration: number | null } }>;
}
