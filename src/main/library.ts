// picture/gif library, one json per item in userData/library (id = hash of the data)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { LibraryItem } from '@shared/ipc';

interface Stored extends LibraryItem { dataUrl: string }

const dir = (): string => join(app.getPath('userData'), 'library');
const file = (id: string): string | null => (/^[0-9a-f]{16}$/.test(id) ? join(dir(), `${id}.json`) : null);
const read = (path: string): Stored | null => { try { return JSON.parse(readFileSync(path, 'utf8')) as Stored; } catch { return null; } };

/** Newest first, without the image data. */
export function list(): LibraryItem[] {
  if (!existsSync(dir())) return [];
  return readdirSync(dir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => read(join(dir(), f)))
    .filter((x): x is Stored => !!x)
    .map(({ dataUrl: _, ...item }) => item)
    .sort((a, b) => b.addedAt - a.addedAt);
}

export function add(item: { name: string; dataUrl: string; thumb: string; frames: number }): LibraryItem | null {
  if (typeof item?.dataUrl !== 'string' || !item.dataUrl.startsWith('data:image/')) return null;
  const id = createHash('sha1').update(item.dataUrl).digest('hex').slice(0, 16);
  const path = file(id)!;
  const existing = existsSync(path) ? read(path) : null;
  if (existing) { const { dataUrl: _, ...meta } = existing; return meta; }
  const stored: Stored = {
    id,
    name: String(item.name).split(/[\\/]/).pop() ?? 'image',
    thumb: typeof item.thumb === 'string' && item.thumb.startsWith('data:image/') ? item.thumb : '',
    frames: Number(item.frames) || 1,
    addedAt: Date.now(),
    dataUrl: item.dataUrl,
  };
  mkdirSync(dir(), { recursive: true });
  writeFileSync(path, JSON.stringify(stored));
  const { dataUrl: _, ...meta } = stored;
  return meta;
}

export function get(id: string): string | null {
  const path = file(id);
  return path && existsSync(path) ? read(path)?.dataUrl ?? null : null;
}

export function remove(id: string): void {
  const path = file(id);
  if (path) rmSync(path, { force: true });
}
