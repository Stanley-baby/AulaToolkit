// Development-only simulated device: set AULA_SIM=<modelId>[,<modelId>] to see a model in the UI without hardware.
// Every call is logged and returns a plausible empty result; nothing is written anywhere.
import type { DeviceModel, DeviceStatus, Link } from '@shared/types';
import type { Driver, DriverContext } from './types';

export class SimDriver implements Driver {
  readonly key: string;
  readonly link: Link = 'usb';
  readonly productName: string;
  constructor(readonly model: DeviceModel, private ctx: DriverContext) {
    this.key = `${model.id}:sim`;
    this.productName = `${model.name} (simulated)`;
    ctx.log('i', `${model.name}: simulated device attached (AULA_SIM)`);
  }
  async status(): Promise<DeviceStatus> {
    return { key: this.key, modelId: this.model.id, link: this.link, productName: this.productName, battery: 73, charging: false };
  }
  async call(method: string, args: unknown[]): Promise<unknown> {
    this.ctx.log('→', `sim ${method}(${JSON.stringify(args).slice(0, 120)})`);
    if (method === 'readAll' || method === 'readLighting' || method === 'readSettings' || method === 'readUserLight') return null;
    return undefined;
  }
  async close(): Promise<void> { /* nothing to release */ }
}
