import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { FirmwarePhase, FirmwareState } from '@shared/ipc';

interface FirmwareImage {
  sha256: string;
  bytes: number;
  checksum: number;
}

export interface FirmwareResult {
  status: string;
  chunksWritten: number;
  flashMayHaveChanged: boolean;
  firmwareVerified: boolean;
  normalProtocolVerified: boolean;
  error?: string;
  originalCodeOption?: number;
  chip?: { securityRaw: number };
}

export interface HidDevice {
  vendorId: number;
  productId: number;
  product?: string;
  usagePage?: number;
  usage?: number;
  release?: number;
  path?: string;
}

interface HidHandle { close(): void }
interface HidApi {
  devices(): HidDevice[];
  HID: new (path: string) => HidHandle;
}

interface FirmwareWriter {
  validateImage(image: Buffer): FirmwareImage;
  flashFirmware(hid: HidApi, image: Buffer, progress: (result: FirmwareResult) => void, target: HidDevice): Promise<FirmwareResult>;
  normalCheck(handle: HidHandle): Promise<boolean>;
}

interface FirmwareManager {
  blockModel(modelId: string): void;
  pauseForFirmware(modelId: string): Promise<void>;
  resumeAfterFirmware(modelId: string, block: boolean): Promise<void>;
}

interface FirmwareOptions {
  enabled: boolean;
  imagePath: string;
  previousImagePath: string;
  journalPath: string;
  writer: FirmwareWriter;
  hid: HidApi;
  manager: FirmwareManager;
  publish(state: FirmwareState): void;
  confirm(state: FirmwareState): Promise<boolean>;
  backup(): void;
  preventSleep(): () => void;
}

const REVIEWED: Record<string, { version: string; release: number }> = {
  '7ef0d72f267621beef543a8068602db253872a5a2a0291e4ccdb1a651e669e22': { version: 'V1.03', release: 0x0103 },
  'ed95aa99b162b8f3746288c02bc04e403b21c86e1792f9c8cb662b1c6c2e8ab3': { version: 'F105', release: 0xf105 },
  '5f8425131cf96e8878dee95950380b7fa788004e91540fbcf30b49d9b2ef2931': { version: 'F106', release: 0xf106 },
  '63e953f39bf07d33975e51aa27f985ad940252d642927506a9953c9f7104ebc7': { version: 'F108', release: 0xf108 },
};
const SOURCE_RELEASES = new Set([0x0103, 0xf104, 0xf105, 0xf106, 0xf107, 0xf108]);

const targetDevices = (devices: HidDevice[]): HidDevice[] => devices.filter((d) =>
  d.vendorId === 0x0c45 && d.productId === 0x800a && d.product === 'AULA-S75Pro' &&
  d.usagePage === 0xff13 && d.usage === 1 && !!d.path);

export class FirmwareUpdater {
  private selected: Buffer | null = null;
  private state: FirmwareState;

  constructor(private readonly options: FirmwareOptions) {
    const recoveryRequired = existsSync(options.journalPath);
    this.state = { phase: recoveryRequired ? 'error' : 'ready', busy: false, progress: 0, selected: null, deviceVersion: null, recoveryRequired };
    if (recoveryRequired) options.manager.blockModel('s75pro');
    try { this.selectBundled(); } catch { /* report the unavailable bundled image in the UI */ }
  }

  private emit(patch: Partial<FirmwareState>): void {
    this.state = { ...this.state, ...patch };
    try { this.options.publish({ ...this.state }); } catch { /* UI delivery must not interrupt a flash */ }
  }

  snapshot(): FirmwareState {
    let deviceVersion: string | null = null;
    if (this.options.enabled && !this.state.busy && !this.state.recoveryRequired) {
      try {
        const devices = targetDevices(this.options.hid.devices());
        if (devices.length === 1 && typeof devices[0].release === 'number') {
          const value = devices[0].release;
          deviceVersion = value >= 0xf000 ? value.toString(16).toUpperCase() : `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
        }
      } catch { /* an absent or inaccessible keyboard remains disconnected */ }
    }
    return { ...this.state, deviceVersion };
  }

  select(path: string, source: 'bundled' | 'previous' | 'file'): FirmwareState {
    if (this.state.busy) throw new Error('Firmware update is already running');
    if (statSync(path).size !== 256 * 1024) throw new Error('Unsupported firmware image');
    const bytes = readFileSync(path);
    const image = this.options.writer.validateImage(bytes);
    const reviewed = REVIEWED[image.sha256];
    if (!reviewed) throw new Error('Firmware version has not been reviewed');
    this.selected = bytes;
    this.emit({ selected: { version: reviewed.version, sha256: image.sha256, source }, phase: this.state.recoveryRequired ? 'error' : 'ready', progress: 0, error: undefined });
    return this.snapshot();
  }

  selectBundled(): FirmwareState { return this.select(this.options.imagePath, 'bundled'); }
  selectPrevious(): FirmwareState { return this.select(this.options.previousImagePath, 'previous'); }

  async start(): Promise<FirmwareState> {
    if (this.state.busy) throw new Error('Firmware update is already running');
    if (!this.options.enabled || this.state.recoveryRequired || !this.selected || !this.state.selected) throw new Error('Firmware update is not available');
    const image = this.selected;
    const metadata = REVIEWED[this.options.writer.validateImage(image).sha256];
    if (!metadata) throw new Error('Firmware version has not been reviewed');
    const targets = targetDevices(this.options.hid.devices());
    if (targets.length !== 1 || !SOURCE_RELEASES.has(targets[0].release ?? -1)) throw new Error('Connect one supported S75 Pro by USB');
    this.emit({ busy: true, phase: 'preparing', progress: 0, error: undefined });
    let paused = false;
    let releaseSleep: (() => void) | undefined;
    try {
      if (!(await this.options.confirm(this.snapshot()))) {
        this.emit({ busy: false, phase: 'ready' });
        return this.snapshot();
      }
      releaseSleep = this.options.preventSleep();
      await this.options.manager.pauseForFirmware('s75pro');
      paused = true;
      const active = targetDevices(this.options.hid.devices());
      if (active.length !== 1 || active[0].path !== targets[0].path || active[0].release !== targets[0].release) {
        throw new Error('The wired keyboard changed before the update began');
      }
      this.options.backup();
      const journal = {
        model: 's75pro', targetVersion: metadata.version, imageSha256: this.state.selected.sha256,
        sourceRelease: active[0].release, startedAt: new Date().toISOString(),
        originalCodeOption: undefined as number | undefined, originalSecurity: undefined as number | undefined,
      };
      writeFileSync(this.options.journalPath, JSON.stringify(journal, null, 2));
      const result = await this.options.writer.flashFirmware(this.options.hid, image, (update) => {
        const phase: FirmwarePhase =
          update.status === 'programming' ? 'programming' :
          update.status.includes('erase') || update.status === 'user_rom_blank' ? 'erasing' :
          ['firmware_checksum_verified', 'code_options_restored', 'candidate_flash_verified', 'stock_flash_verified', 'firmware_written_normal_unconfirmed'].includes(update.status) ? 'verifying' :
          update.status === 'user_mode_requested' ? 'restarting' : 'preparing';
        this.emit({ phase, progress: Math.min(100, Math.floor(update.chunksWritten * 100 / 4096)) });
      }, active[0]);
      if (result.firmwareVerified && !result.normalProtocolVerified && result.status === 'firmware_written_normal_unconfirmed') {
        for (let attempt = 0; attempt < 3 && !result.normalProtocolVerified; attempt++) {
          await delay(500);
          const devices = targetDevices(this.options.hid.devices());
          if (devices.length !== 1) continue;
          const handle = new this.options.hid.HID(devices[0].path!);
          try { result.normalProtocolVerified = await this.options.writer.normalCheck(handle); } catch { /* retry the read only */ }
          finally { handle.close(); }
        }
      }
      const normal = targetDevices(this.options.hid.devices());
      if (!(result.firmwareVerified && result.normalProtocolVerified && normal.length === 1 && normal[0].release === metadata.release)) {
        if (!result.flashMayHaveChanged) {
          for (let attempt = 0; attempt < 3; attempt++) {
            await delay(500);
            const devices = targetDevices(this.options.hid.devices());
            if (devices.length !== 1 || devices[0].release !== targets[0].release) continue;
            const handle = new this.options.hid.HID(devices[0].path!);
            try {
              if (await this.options.writer.normalCheck(handle)) {
                rmSync(this.options.journalPath, { force: true });
                break;
              }
            } catch { /* keep the incomplete-update record until normal communication is confirmed */ }
            finally { handle.close(); }
          }
        }
        throw new Error(result.error ?? 'The firmware or normal device could not be verified');
      }
      rmSync(this.options.journalPath, { force: true });
      this.emit({ phase: 'success', progress: 100, recoveryRequired: false, error: undefined });
    } catch (error) {
      const recoveryRequired = existsSync(this.options.journalPath);
      this.emit({ phase: 'error', recoveryRequired, error: (error as Error).message });
    } finally {
      const recoveryRequired = existsSync(this.options.journalPath);
      try {
        if (paused) await this.options.manager.resumeAfterFirmware('s75pro', recoveryRequired);
      } catch (error) {
        this.emit({ phase: 'error', error: (error as Error).message });
      } finally {
        try { releaseSleep?.(); } finally { this.emit({ busy: false }); }
      }
    }
    return this.snapshot();
  }

  async recheck(): Promise<FirmwareState> {
    if (!this.options.enabled || this.state.busy || !this.state.recoveryRequired) throw new Error('Recovery check is not available');
    this.emit({ busy: true, phase: 'verifying', error: undefined });
    let paused = false;
    try {
      const journal = JSON.parse(readFileSync(this.options.journalPath, 'utf8'));
      const reviewed = REVIEWED[journal.imageSha256];
      if (!reviewed || journal.targetVersion !== reviewed.version || !journal.firmwareVerified ||
          !journal.codeOptionsRestored || !journal.userModeRequested) {
        throw new Error('The interrupted update requires further recovery');
      }
      const targets = targetDevices(this.options.hid.devices());
      if (targets.length !== 1 || targets[0].release !== reviewed.release) throw new Error('The updated keyboard is not available over USB');
      await this.options.manager.pauseForFirmware('s75pro');
      paused = true;
      const active = targetDevices(this.options.hid.devices());
      if (active.length !== 1 || active[0].path !== targets[0].path || active[0].release !== reviewed.release) throw new Error('The wired keyboard changed');
      const handle = new this.options.hid.HID(active[0].path!);
      try {
        if (!(await this.options.writer.normalCheck(handle))) throw new Error('The keyboard did not respond normally');
      } finally { handle.close(); }
      rmSync(this.options.journalPath);
      this.emit({ phase: 'success', progress: 100, recoveryRequired: false });
    } catch (error) {
      this.emit({ phase: 'error', recoveryRequired: true, error: (error as Error).message });
    } finally {
      try {
        if (paused) await this.options.manager.resumeAfterFirmware('s75pro', this.state.recoveryRequired);
      } finally { this.emit({ busy: false }); }
    }
    return this.snapshot();
  }
}
