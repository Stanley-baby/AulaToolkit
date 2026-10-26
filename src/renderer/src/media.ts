// gif decoding + drawing helpers
import type { LibraryItem } from '@shared/ipc';

export interface DecodedFrame { bitmap: ImageBitmap; delayMs: number }
export type FitMode = 'cover' | 'fit';

// fetch() on data: URLs is blocked by the CSP
function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('Unreadable image');
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(o: { frameIndex: number }): Promise<{ image: VideoFrame & { duration: number | null } }>;
}

export async function decodeImage(dataUrl: string): Promise<DecodedFrame[]> {
  const blob = dataUrlToBlob(dataUrl);
  const frames: DecodedFrame[] = [];
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
  return frames;
}

/** Crop position for `cover`, 0..1 per axis. */
export interface CropPos { x: number; y: number }
export const CENTRE: CropPos = { x: 0.5, y: 0.5 };

export function drawInto(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, bmp: ImageBitmap | undefined, w: number, h: number, mode: FitMode, pos: CropPos = CENTRE): void {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (!bmp) return;
  const s = mode === 'cover' ? Math.max(w / bmp.width, h / bmp.height) : Math.min(w / bmp.width, h / bmp.height);
  const dw = bmp.width * s, dh = bmp.height * s;
  const p = mode === 'cover' ? pos : CENTRE;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (w - dw) * p.x, (h - dh) * p.y, dw, dh);
}

export function cropRoom(bmp: { width: number; height: number }, w: number, h: number): { x: number; y: number } {
  const s = Math.max(w / bmp.width, h / bmp.height);
  return { x: Math.max(0, bmp.width * s - w), y: Math.max(0, bmp.height * s - h) };
}

export function thumbnail(bmp: ImageBitmap, size = 112): string {
  const c = document.createElement('canvas');
  const s = Math.min(1, size / Math.max(bmp.width, bmp.height));
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

export async function addFromFile(): Promise<{ item: LibraryItem; dataUrl: string; frames: DecodedFrame[] } | null> {
  const r = await window.aula.pickImage();
  if (!r) return null;
  const frames = await decodeImage(r.dataUrl);
  const item = await window.aula.libraryAdd({ name: r.name, dataUrl: r.dataUrl, thumb: thumbnail(frames[0].bitmap), frames: frames.length });
  return item ? { item, dataUrl: r.dataUrl, frames } : null;
}
