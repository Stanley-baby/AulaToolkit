import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock('electron', () => ({ utilityProcess: { fork: mock.fork } }));
import { runFirmwareWorker } from '../src/main/firmwareWorker';

class Child extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn(() => { this.emit('exit', 0); return true; });
}

beforeEach(() => mock.fork.mockReset());

it('forwards progress and waits for the isolated writer to exit', async () => {
  const child = new Child();
  mock.fork.mockReturnValue(child);
  const progress = vi.fn();
  const target = { vendorId: 0x0c45, productId: 0x800a, path: 'keyboard', release: 0xf106 };
  const done = runFirmwareWorker('/worker', '/hid', '/journal', Buffer.from([1]), 'sha', target, progress);
  expect(child.postMessage).toHaveBeenCalledWith(expect.objectContaining({ imageSha256: 'sha', target: { path: 'keyboard', release: 0xf106 } }));
  child.emit('message', { type: 'progress', result: { status: 'programming', chunksWritten: 256 } });
  const result = { status: 'candidate_flash_verified', chunksWritten: 4096, firmwareVerified: true };
  child.emit('message', { type: 'result', result });
  await expect(done).resolves.toEqual(result);
  expect(progress).toHaveBeenCalledWith({ status: 'programming', chunksWritten: 256 });
  expect(child.kill).toHaveBeenCalledOnce();
});

it('reports a worker crash without claiming a completed write', async () => {
  const child = new Child();
  mock.fork.mockReturnValue(child);
  const done = runFirmwareWorker('/worker', '/hid', '/journal', Buffer.from([1]), 'sha', { vendorId: 1, productId: 2 }, vi.fn());
  child.emit('exit', 1);
  await expect(done).rejects.toThrow('Firmware worker exited (1)');
});
