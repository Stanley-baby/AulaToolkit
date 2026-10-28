import type { DeviceModel, DeviceStatus, Link } from '@shared/types';
import type { LightChange } from '@shared/lightWatch';
import type { Logger } from '../transport';

export interface Driver {
  readonly model: DeviceModel;
  readonly link: Link;
  readonly key: string;
  readonly productName: string;
  /** HID paths in use; the driver is dropped when one of them disappears. */
  readonly paths?: string[];
  /** Live status including battery and any read-back values. */
  status(): Promise<DeviceStatus>;
  /** Generic dispatcher so IPC can reach driver methods by name. */
  call(method: string, args: unknown[]): Promise<unknown>;
  close(): Promise<void>;
}

export interface DriverContext {
  log: Logger;
  onStatus: () => void;
  /** Device-originated change (e.g. DPI button); modelId is filled in by the manager. */
  onEvent?: (e: DriverEvent) => void;
  /** Live per-key colours (key code → RGB) as the LEDs show them right now. */
  onLiveLight?: (colors: Record<number, [number, number, number]>) => void;
  /** True while live lighting is on screen; otherwise drivers poll only as fast as change detection needs. */
  liveViewActive?: () => boolean;
  /** Official AULA driver is running: stop watching the LEDs. */
  watchPaused?: () => boolean;
  onProgress?: (task: 'screen', done: number, total: number) => void;
}

export type DriverEvent =
  | { kind: 'dpi'; stage: number; count?: number; value?: number }
  | { kind: 'polling'; hz: number }
  | ({ kind: 'light' } & LightChange);
