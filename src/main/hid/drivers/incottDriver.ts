// Transport + sequencing for the PixArt 8K platform (AULA SC900 series).
import type { Device } from 'node-hid';
import type { DeviceModel, DeviceStatus, KeyAction, Link, MacroStep, MouseProfile } from '@shared/types';
import * as P from '@shared/protocols/incott';
import { HidPort, hex, sleep } from '../transport';
import type { Driver, DriverContext } from './types';

const SETTLE_MS = 50;
const ATTEMPTS = 12;

export class IncottDriver implements Driver {
  readonly key: string;
  readonly link: Link;
  private battery: number | null = null;
  private charging = false;
  private identity: P.Identity | null = null;
  private unsubInput: (() => void) | null = null;
  private lastInputAt = 0;
  private hwStage: number | null = null;
  private hwPolling: number | null = null;
  private dpiStages: number[] = [];
  private dpiCount: number | null = null;

  private constructor(readonly model: DeviceModel, private port: HidPort, link: Link, private ctx: DriverContext) {
    this.link = link;
    this.key = `${model.id}:${link}`;
  }

  get productName(): string { return this.port.info.product ?? this.model.name; }
  get paths(): string[] { return [this.port.path]; }

  static async attach(model: DeviceModel, devices: Device[], ctx: DriverContext): Promise<IncottDriver | null> {
    const roleOf = (d: Device) => model.usb.find((u) => u.vendorId === d.vendorId && u.productId === d.productId)?.role;
    // Prefer the wired link when both are present (the dongle keeps enumerating while charging).
    const cands = devices
      .filter((d) => roleOf(d) && (d.usagePage ?? 0) === P.USAGE_PAGE)
      .sort((a, b) => (roleOf(a) === 'usb' ? 0 : 1) - (roleOf(b) === 'usb' ? 0 : 1));
    for (const d of cands) {
      let port: HidPort | null = null;
      try {
        port = await HidPort.open(d);
        const drv = new IncottDriver(model, port, roleOf(d) === 'usb' ? 'usb' : '2.4g', ctx);
        const id = P.decodeIdentity(await drv.exchange(P.query(P.CMD.Q_IDENTITY), P.CMD.Q_IDENTITY, null) ?? new Uint8Array());
        if (!id) { await port.close(); continue; }
        drv.identity = id;
        drv.listen();
        ctx.log('i', `${model.name} attached over ${drv.link.toUpperCase()} (identity ${id.raw}, sensor ${id.sensor}${id.receiver8k ? ', 8K receiver' : ''})`);
        return drv;
      } catch (e) {
        await port?.close();
        ctx.log('!', `${model.name}: ${(e as Error).message}`);
      }
    }
    return null;
  }

  private listen(): void {
    this.unsubInput = this.port.onInput((b) => {
      // node-hid delivers the report id at byte 0.
      if (b[0] !== P.REPORT_ID || b.length < 3) return;
      const st = P.decodeInputStatus(b[1], b[2]);
      if (!st) return;
      const changed = st.battery !== this.battery || st.charging !== this.charging;
      this.battery = st.battery; this.charging = st.charging; this.lastInputAt = Date.now();
      // The same report carries the active DPI stage (high nibble) and polling index (low nibble);
      // verified on an SC900 Pro against query 0x8b. The first report only primes the baseline.
      if (this.hwStage !== null && st.dpiStage !== this.hwStage) {
        this.ctx.onEvent?.({ kind: 'dpi', stage: st.dpiStage, count: this.dpiCount ?? undefined, value: this.dpiStages[st.dpiStage] });
      }
      const hz = P.POLLING_WIRE_TO_HZ[st.pollingIndex];
      if (this.hwPolling !== null && hz && hz !== this.hwPolling) this.ctx.onEvent?.({ kind: 'polling', hz });
      this.hwStage = st.dpiStage;
      if (hz) this.hwPolling = hz;
      if (changed) this.ctx.onStatus();
    });
  }

  async status(): Promise<DeviceStatus> {
    const live = await this.readAll().catch(() => undefined);
    const asleep = live && Object.values(live).every((v) => v === null || v === undefined);
    return {
      key: this.key, modelId: this.model.id, link: this.link, productName: this.productName,
      battery: this.battery, batteryAt: this.lastInputAt || null, charging: this.link === 'usb' ? true : this.charging,
      live: { ...(live ?? {}), sensor: this.identity?.sensor, receiver8k: this.identity?.receiver8k, modelCode: this.identity?.modelCode },
      note: asleep ? 'asleep' : undefined,
    };
  }

  async call(method: string, args: unknown[]): Promise<unknown> {
    const fn = (this as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
    if (typeof fn !== 'function' || ['call', 'close', 'exchange'].includes(method)) throw new Error(`Unknown method ${method}`);
    return fn.apply(this, args);
  }

  private closed = false;
  async close(): Promise<void> { this.closed = true; this.unsubInput?.(); await this.port.close(); }

  // ---- transport ----
  private async read(): Promise<Uint8Array | null> {
    try { return new Uint8Array(await this.port.getFeature(P.REPORT_ID, 64)); } catch { return null; }
  }

  /** Sends a request and waits for a frame whose command (and sub) echo it. */
  private exchange(frame: Uint8Array, cmd: number, sub: number | null, axis: number | null = null): Promise<Uint8Array | null> {
    return this.port.exclusive(async () => {
      if (this.closed) return null; // unplugged
      try {
        await this.read(); // discard the latched frame
        this.ctx.log('→', hex(frame));
        await this.port.sendFeatureRaw(frame);
        for (let i = 0; i < ATTEMPTS; i++) {
          await sleep(SETTLE_MS);
          const f = await this.read();
          if (f && P.frameMatches(f, cmd, sub, axis)) { this.ctx.log('←', hex(f, 12)); return f; }
        }
        this.ctx.log('!', `no reply to ${cmd.toString(16)}/${sub ?? '-'} (mouse asleep?)`);
        return null;
      } catch (e) { this.ctx.log('!', (e as Error).message); return null; }
    });
  }

  private write(frame: Uint8Array): Promise<void> {
    return this.port.exclusive(async () => {
      this.ctx.log('→', hex(frame));
      await this.port.sendFeatureRaw(frame);
      await sleep(SETTLE_MS);
    });
  }

  private query(cmd: number, sub = 0): Promise<Uint8Array | null> {
    return this.exchange(P.query(cmd, sub), cmd, P.SUB_ECHOING.includes(cmd) ? sub : null);
  }

  // ---- reads ----
  private readChain: Promise<unknown> = Promise.resolve();

  /** Reads every value the firmware reports. Calls are serialised so two readers never interleave queries. */
  readAll(): Promise<Partial<MouseProfile>> {
    const run = this.readChain.then(() => this.readAllNow(), () => this.readAllNow());
    this.readChain = run.catch(() => undefined);
    return run;
  }

  private async queryRetry(cmd: number, sub = 0): Promise<Uint8Array | null> {
    return (await this.query(cmd, sub)) ?? (await this.query(cmd, sub));
  }

  private async readAllNow(): Promise<Partial<MouseProfile>> {
    const out: Partial<MouseProfile> = {};
    const cyc = P.decodeDpiCycle((await this.query(P.CMD.Q_DPI_CYCLE)) ?? new Uint8Array());
    if (cyc) { out.dpiCount = cyc.count; out.dpiActive = cyc.active; out.dpiLed = cyc.ledEffect; out.dpiExtra = cyc.extra; }
    const stages: number[] = [];
    for (let s = 0; s < P.DPI_STAGES; s++) {
      const v = P.decodeDpiStage((await this.queryRetry(P.CMD.Q_DPI_VALUE, s)) ?? new Uint8Array(), s);
      if (v === null) break;
      stages.push(v);
    }
    if (stages.length) { out.dpiStages = stages; this.dpiStages = stages; }
    if (out.dpiCount) this.dpiCount = out.dpiCount;
    const poll = P.decodePolling((await this.query(P.CMD.Q_POLLING)) ?? new Uint8Array());
    if (poll !== null) out.polling = poll;
    const lod = P.decodeLiftOff((await this.query(P.CMD.Q_SENSOR, P.SUB.LOD)) ?? new Uint8Array());
    if (lod !== null) out.liftOff = lod;
    const rip = P.decodeToggle((await this.query(P.CMD.Q_SENSOR, P.SUB.RIPPLE)) ?? new Uint8Array(), P.SUB.RIPPLE);
    if (rip !== null) out.ripple = rip;
    const ang = P.decodeToggle((await this.query(P.CMD.Q_SENSOR, P.SUB.ANGLE_SNAP)) ?? new Uint8Array(), P.SUB.ANGLE_SNAP);
    if (ang !== null) out.angleSnap = ang;
    const ms = P.decodeToggle((await this.query(P.CMD.Q_SENSOR, P.SUB.MOTION_SYNC)) ?? new Uint8Array(), P.SUB.MOTION_SYNC);
    if (ms !== null) out.motionSync = ms;
    const perf = P.decodePerformance((await this.query(P.CMD.Q_SENSOR, P.SUB.PERFORMANCE)) ?? new Uint8Array());
    if (perf !== null) out.performance = perf;
    const deb = P.decodeDebounce((await this.query(P.CMD.Q_TIMING, P.SUB.DEBOUNCE)) ?? new Uint8Array());
    if (deb !== null) out.debounce = deb;
    const slp = P.decodeSleep((await this.query(P.CMD.Q_TIMING, P.SUB.SLEEP)) ?? new Uint8Array());
    if (slp !== null) out.sleep = slp;
    const fire = P.decodeFireKey((await this.queryRetry(P.CMD.Q_TIMING, P.SUB.FIRE_KEY)) ?? new Uint8Array());
    if (fire) out.fireKey = fire;
    // 0x88 (receiver LED) gets no reply from the SC900 Pro firmware; it is only written, never read.
    const buttons: Record<number, KeyAction> = {};
    for (let b = 0; b < P.BUTTON_COUNT; b++) {
      const code = P.decodeButtonCode((await this.query(P.CMD.Q_BUTTON, b)) ?? new Uint8Array(), b);
      if (code === null) break;
      buttons[b] = P.decodeButton(code);
    }
    if (Object.keys(buttons).length) out.buttons = buttons;
    return out;
  }

  // ---- writes (each verified by read-back where the protocol allows) ----
  async setPolling(hz: number): Promise<number | null> {
    if (this.link === 'usb' && hz > P.POLLING_WIRED_MAX) throw new Error('Rates above 1000 Hz need the 2.4 GHz dongle');
    await this.write(P.setPolling(hz));
    return P.decodePolling((await this.query(P.CMD.Q_POLLING)) ?? new Uint8Array());
  }

  async setDpiStages(stages: number[]): Promise<number[]> {
    const out: number[] = [];
    for (let i = 0; i < Math.min(stages.length, P.DPI_STAGES); i++) {
      await this.write(P.setDpiStage(i, stages[i]));
      const v = P.decodeDpiStage((await this.query(P.CMD.Q_DPI_VALUE, i)) ?? new Uint8Array(), i);
      out.push(v ?? stages[i]);
    }
    return out;
  }

  async setDpiStage(stage: number, dpi: number, axis = 0): Promise<number | null> {
    await this.write(P.setDpiStage(stage, dpi, axis));
    return P.decodeDpiStage((await this.query(P.CMD.Q_DPI_VALUE, stage)) ?? new Uint8Array(), stage);
  }

  async setDpiCycle(count: number, active: number, ledEffect?: number, extra?: [number, number]): Promise<{ count: number; active: number; ledEffect: number; extra: [number, number] } | null> {
    // The block carries three more bytes; keep whatever the device reports unless the caller sets them.
    const cur = P.decodeDpiCycle((await this.query(P.CMD.Q_DPI_CYCLE)) ?? new Uint8Array());
    await this.write(P.setDpiCycle(count, active, ledEffect ?? cur?.ledEffect ?? 0, extra ?? cur?.extra ?? [1, 1]));
    return P.decodeDpiCycle((await this.query(P.CMD.Q_DPI_CYCLE)) ?? new Uint8Array());
  }

  async setLiftOff(tenths: number): Promise<number | null> {
    await this.write(P.setLiftOff(tenths));
    return P.decodeLiftOff((await this.query(P.CMD.Q_SENSOR, P.SUB.LOD)) ?? new Uint8Array());
  }

  async setToggle(kind: 'ripple' | 'angleSnap' | 'motionSync', on: boolean): Promise<boolean | null> {
    const sub = { ripple: P.SUB.RIPPLE, angleSnap: P.SUB.ANGLE_SNAP, motionSync: P.SUB.MOTION_SYNC }[kind];
    await this.write(P.setToggle(sub, on));
    return P.decodeToggle((await this.query(P.CMD.Q_SENSOR, sub)) ?? new Uint8Array(), sub);
  }

  async setPerformance(wire: number): Promise<number | null> {
    await this.write(P.setPerformance(wire));
    return P.decodePerformance((await this.query(P.CMD.Q_SENSOR, P.SUB.PERFORMANCE)) ?? new Uint8Array());
  }

  async setDebounce(ms: number): Promise<number | null> {
    await this.write(P.setDebounce(ms));
    return P.decodeDebounce((await this.query(P.CMD.Q_TIMING, P.SUB.DEBOUNCE)) ?? new Uint8Array());
  }

  async setSleep(seconds: number): Promise<number | null> {
    await this.write(P.setSleep(seconds));
    return P.decodeSleep((await this.query(P.CMD.Q_TIMING, P.SUB.SLEEP)) ?? new Uint8Array());
  }

  async setFireKey(times: number, intervalMs: number): Promise<{ times: number; intervalMs: number } | null> {
    await this.write(P.setFireKey(times, intervalMs));
    return P.decodeFireKey((await this.query(P.CMD.Q_TIMING, P.SUB.FIRE_KEY)) ?? new Uint8Array());
  }

  async setReceiverLed(mode: number): Promise<number | null> {
    await this.write(P.setReceiverLed(mode));
    return P.decodeReceiverLed((await this.query(P.CMD.Q_RECEIVER_LED)) ?? new Uint8Array());
  }

  async setButton(slot: number, action: KeyAction): Promise<KeyAction | null> {
    const code = P.encodeButton(action, P.DEFAULT_BUTTON_CODES[slot] ?? 0);
    if (code === null) throw new Error('This action is not available on the mouse');
    await this.write(P.setButton(slot, code));
    const back = P.decodeButtonCode((await this.query(P.CMD.Q_BUTTON, slot)) ?? new Uint8Array(), slot);
    return back === null ? null : P.decodeButton(back);
  }

  async setButtons(buttons: Record<number, KeyAction>): Promise<void> {
    for (let slot = 0; slot < P.BUTTON_COUNT; slot++) await this.setButton(slot, buttons[slot] ?? { type: 'default' });
  }

  /** Uploads one macro into an on-device buffer (0-9). loop: 0 until release, 1 until any key, 2 cycle N. */
  async uploadMacro(bufferId: number, steps: MacroStep[], loop: 0 | 1 | 2 = 2, cycles = 1): Promise<void> {
    const buf = P.macroBuffer(bufferId, P.toIncottSteps(steps), loop, cycles, Date.now() & 0x7fffffff);
    const chunks = P.macroChunks(buf);
    for (let i = 0; i < chunks.length; i++) {
      await this.write(P.macroChunkHeader(i, bufferId));
      await this.port.exclusive(async () => {
        this.ctx.log('→', `macro chunk ${i + 1}/${chunks.length}`);
        await this.port.write(P.REPORT_ID, chunks[i]);
        await sleep(80);
      });
    }
  }

  async applyProfile(m: MouseProfile): Promise<Partial<MouseProfile>> {
    const stages = await this.setDpiStages(m.dpiStages);
    const cyc = await this.setDpiCycle(Math.max(1, Math.min(P.DPI_STAGES, m.dpiCount || stages.length)), Math.min(m.dpiActive, (m.dpiCount || stages.length) - 1), m.dpiLed, m.dpiExtra);
    const polling = await this.setPolling(this.link === 'usb' ? Math.min(m.polling, P.POLLING_WIRED_MAX) : m.polling);
    await this.setLiftOff(m.liftOff);
    await this.setToggle('ripple', m.ripple);
    await this.setToggle('angleSnap', m.angleSnap);
    await this.setToggle('motionSync', m.motionSync);
    await this.setPerformance(m.performance);
    await this.setDebounce(m.debounce);
    await this.setSleep(m.sleep);
    await this.setFireKey(m.fireKey.times, m.fireKey.intervalMs);
    await this.setReceiverLed(m.receiverLed);
    await this.setButtons(m.buttons);
    return { dpiStages: stages, dpiCount: cyc?.count, dpiActive: cyc?.active, polling: polling ?? undefined };
  }
}
