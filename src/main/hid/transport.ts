// Thin async wrapper around node-hid with the conventions this app needs:
//  - feature reports are sent/received with the report id as the first byte;
//  - input reports are buffered into a queue that drivers can await with a timeout;
//  - every call is serialised per port so protocol sequences never interleave.
import HID from 'node-hid';
import type { Device } from 'node-hid';

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Precise short wait. Windows rounds setTimeout up to its ~15 ms timer tick, which turns a 1–5 ms
 * protocol delay into 15 ms; this yields to the event loop until the deadline instead.
 */
export const waitPrecise = (ms: number): Promise<void> => new Promise((resolve) => {
  const end = process.hrtime.bigint() + BigInt(Math.round(ms * 1e6));
  const spin = (): void => { if (process.hrtime.bigint() >= end) resolve(); else setImmediate(spin); };
  spin();
});
export const hex = (b: ArrayLike<number>, max = 64): string =>
  Array.from(b).slice(0, max).map((x) => x.toString(16).padStart(2, '0')).join(' ') + (b.length > max ? ' …' : '');

export type Logger = (dir: '→' | '←' | '⇢' | '⇠' | '!' | 'i', text: string) => void;

export function listDevices(): Device[] {
  try { return HID.devices(); } catch { return []; }
}

export const pathIface = (d: Device): number | null => {
  const m = /mi_(\d\d)/i.exec(d.path ?? '');
  return m ? parseInt(m[1], 10) : typeof d.interface === 'number' && d.interface >= 0 ? d.interface : null;
};

export class HidPort {
  private dev: HID.HIDAsync | null = null;
  private queue: Buffer[] = [];
  private waiters: ((b: Buffer | null) => void)[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  private listeners: ((b: Buffer) => void)[] = [];
  readonly info: Device;

  private constructor(info: Device) { this.info = info; }

  static async open(info: Device): Promise<HidPort> {
    const p = new HidPort(info);
    p.dev = await HID.HIDAsync.open(info.path!, { nonExclusive: true });
    // node-hid starts its read loop on the first 'data' listener; register exactly one.
    p.dev.on('data', (b: Buffer) => { const buf = Buffer.from(b); p.push(buf); for (const l of p.listeners) l(buf); });
    p.dev.on('error', () => { /* surfaces as timeouts; the manager re-enumerates */ });
    return p;
  }

  get path(): string { return this.info.path ?? ''; }
  get opened(): boolean { return this.dev !== null; }

  private push(b: Buffer): void {
    const w = this.waiters.shift();
    if (w) w(b); else { this.queue.push(b); if (this.queue.length > 128) this.queue.shift(); }
  }

  /** Serialises an operation on this port. */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    this.pending++;
    const run = this.tail.then(fn, fn).finally(() => { this.pending--; });
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** True while an operation is running or queued on this port. */
  get busy(): boolean { return this.pending > 0; }
  private pending = 0;

  flushInput(): void { this.queue = []; }

  nextInput(timeoutMs: number): Promise<Buffer | null> {
    if (this.queue.length) return Promise.resolve(this.queue.shift()!);
    return new Promise((resolve) => {
      const w = (b: Buffer | null): void => { clearTimeout(t); resolve(b); };
      const t = setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); resolve(null); }, timeoutMs);
      this.waiters.push(w);
    });
  }

  onInput(cb: (b: Buffer) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  /** Sends a feature report; `data` excludes the report id. */
  async sendFeature(reportId: number, data: Uint8Array): Promise<void> {
    if (!this.dev) throw new Error('port closed');
    await this.dev.sendFeatureReport(Buffer.concat([Buffer.from([reportId]), Buffer.from(data)]));
  }

  /** Sends a feature report whose first byte already is the report id. */
  async sendFeatureRaw(frame: Uint8Array): Promise<void> {
    if (!this.dev) throw new Error('port closed');
    await this.dev.sendFeatureReport(Buffer.from(frame));
  }

  /** Reads a feature report; the result includes the report id at byte 0. */
  async getFeature(reportId: number, length: number): Promise<Buffer> {
    if (!this.dev) throw new Error('port closed');
    return Buffer.from(await this.dev.getFeatureReport(reportId, length));
  }

  /** Writes an output report; `data` excludes the report id. */
  async write(reportId: number, data: Uint8Array): Promise<void> {
    if (!this.dev) throw new Error('port closed');
    await this.dev.write(Buffer.concat([Buffer.from([reportId]), Buffer.from(data)]));
  }

  async close(): Promise<void> {
    const d = this.dev; this.dev = null;
    this.waiters.splice(0).forEach((w) => w(null));
    try { await d?.close(); } catch { /* ignore */ }
  }
}

/** Tries to read a feature report; true when the collection has one of that id. Harmless probe. */
export async function hasFeatureReport(info: Device, reportId: number, length: number): Promise<boolean> {
  let port: HidPort | null = null;
  try {
    port = await HidPort.open(info);
    await port.getFeature(reportId, length);
    return true;
  } catch {
    return false;
  } finally {
    await port?.close();
  }
}
