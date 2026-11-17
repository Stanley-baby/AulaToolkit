import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirmwareUpdater } from '../src/main/firmware';

const require = createRequire(import.meta.url);
const realWriter = require('../resources/firmware/stock-flash.cjs');
const imagePath = resolve('resources/firmware/S75Pro-F106.bin');
const previousImagePath = resolve('resources/firmware/S75Pro-F105.bin');
const image = readFileSync(imagePath);
const target = { vendorId: 0x0c45, productId: 0x800a, product: 'AULA-S75Pro', usagePage: 0xff13, usage: 1, release: 0xf106, path: 'wired-keyboard' };
const directories: string[] = [];

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'aula-firmware-test-'));
  directories.push(dir);
  const journalPath = join(dir, 'incomplete.json');
  const events: string[] = [];
  const manager = {
    blockModel: vi.fn(),
    pauseForFirmware: vi.fn(async () => { events.push('pause'); }),
    resumeAfterFirmware: vi.fn(async (_model: string, blocked: boolean) => { events.push(`resume:${blocked}`); }),
  };
  const hid = {
    devices: vi.fn(() => [target]),
    HID: class { close() {} },
  };
  const writer = {
    validateImage: realWriter.validateImage,
    normalCheck: vi.fn(async () => true),
    flashFirmware: vi.fn(async (_hid: unknown, _image: Buffer, progress: (state: any) => void) => {
      expect(existsSync(journalPath)).toBe(true);
      events.push('flash');
      progress({ status: 'isp_verified', chunksWritten: 0, originalCodeOption: 0xffff, chip: { securityRaw: 0x5a5a } });
      progress({ status: 'programming', chunksWritten: 2048 });
      return { status: 'candidate_flash_verified', chunksWritten: 4096, flashMayHaveChanged: true, firmwareVerified: true, normalProtocolVerified: true };
    }),
  };
  const options = {
    enabled: true, imagePath, previousImagePath, journalPath, writer, hid, manager,
    publish: vi.fn(), confirm: vi.fn(async () => true),
    backup: vi.fn(() => { events.push('backup'); }),
    preventSleep: vi.fn(() => () => { events.push('release-sleep'); }),
  };
  const updater = new FirmwareUpdater(options);
  return { updater, options, writer, hid, manager, journalPath, dir, events };
}

describe('firmware update safeguards', () => {
  it('rejects altered or unreviewed images without changing the selection or device', () => {
    const { updater, writer, dir } = setup();
    const bad = Buffer.from(image);
    bad[100] ^= 1;
    const path = join(dir, 'bad.bin');
    writeFileSync(path, bad);
    expect(() => updater.select(path, 'file')).toThrow();
    expect(updater.snapshot().selected?.version).toBe('F106');
    expect(writer.flashFirmware).not.toHaveBeenCalled();
  });

  it('requires one wired keyboard with a reviewed source version', async () => {
    const { updater, hid, writer } = setup();
    hid.devices.mockReturnValue([]);
    await expect(updater.start()).rejects.toThrow('USB');
    hid.devices.mockReturnValue([{ ...target, release: 0x9999 }]);
    await expect(updater.start()).rejects.toThrow('USB');
    hid.devices.mockReturnValue([target, target]);
    await expect(updater.start()).rejects.toThrow('USB');
    expect(writer.flashFirmware).not.toHaveBeenCalled();
  });

  it('does not access a real keyboard from a simulated application session', async () => {
    const { options, writer } = setup();
    const updater = new FirmwareUpdater({ ...options, enabled: false });
    expect(updater.snapshot().deviceVersion).toBeNull();
    await expect(updater.start()).rejects.toThrow('not available');
    expect(writer.flashFirmware).not.toHaveBeenCalled();
  });

  it('does nothing to the device when the user cancels', async () => {
    const { updater, options, manager, writer, journalPath } = setup();
    options.confirm.mockResolvedValue(false);
    expect((await updater.start()).phase).toBe('ready');
    expect(manager.pauseForFirmware).not.toHaveBeenCalled();
    expect(options.backup).not.toHaveBeenCalled();
    expect(writer.flashFirmware).not.toHaveBeenCalled();
    expect(existsSync(journalPath)).toBe(false);
  });

  it('rejects a second update while confirmation is pending', async () => {
    const { updater, options, writer } = setup();
    let cancel!: (value: boolean) => void;
    options.confirm.mockImplementationOnce(() => new Promise((resolve) => { cancel = resolve; }));
    const first = updater.start();
    await expect(updater.start()).rejects.toThrow('already running');
    cancel(false);
    await first;
    expect(writer.flashFirmware).not.toHaveBeenCalled();
  });

  it('pauses device communication, writes the journal first, verifies and resumes', async () => {
    const { updater, writer, journalPath, events, manager } = setup();
    const result = await updater.start();
    expect(result.phase).toBe('success');
    expect(result.busy).toBe(false);
    expect(result.progress).toBe(100);
    expect(writer.flashFirmware).toHaveBeenCalledTimes(1);
    expect(manager.resumeAfterFirmware).toHaveBeenCalledWith('s75pro', false);
    expect(events).toEqual(['pause', 'backup', 'flash', 'resume:false', 'release-sleep']);
    expect(existsSync(journalPath)).toBe(false);
  });

  it.each(['candidate_flash_verified', 'stock_flash_verified', 'firmware_written_normal_unconfirmed'])(
    'keeps the final %s check out of the preparing phase',
    async (status) => {
      const { updater, options, writer } = setup();
      writer.flashFirmware.mockImplementationOnce(async (_hid, _image, progress) => {
        progress({ status: 'programming', chunksWritten: 4096 });
        progress({ status: 'user_mode_requested', chunksWritten: 4096 });
        progress({ status, chunksWritten: 4096 });
        return { status, chunksWritten: 4096, flashMayHaveChanged: true, firmwareVerified: true, normalProtocolVerified: status !== 'firmware_written_normal_unconfirmed' };
      });
      expect((await updater.start()).phase).toBe('success');
      expect(options.publish.mock.calls.map(([state]) => state.phase)).toEqual([
        'ready', 'preparing', 'programming', 'restarting', 'verifying', 'success', 'success',
      ]);
    },
  );

  it('retains the journal and blocks ordinary device traffic after an interrupted write', async () => {
    const { updater, options, writer, journalPath, manager } = setup();
    writer.flashFirmware.mockImplementation(async (_hid, _image, progress) => {
      progress({ status: 'isp_verified', chunksWritten: 0, originalCodeOption: 0xffff, chip: { securityRaw: 0x5a5a } });
      return { status: 'flash_incomplete_stay_in_isp', chunksWritten: 16, flashMayHaveChanged: true, firmwareVerified: false, normalProtocolVerified: false };
    });
    const result = await updater.start();
    expect(result.phase).toBe('error');
    expect(result.recoveryRequired).toBe(true);
    expect(existsSync(journalPath)).toBe(true);
    expect(manager.resumeAfterFirmware).toHaveBeenCalledWith('s75pro', true);
    new FirmwareUpdater(options);
    expect(manager.blockModel).toHaveBeenCalledWith('s75pro');
  });

  it('rechecks normal communication without reflashing when the first read times out', async () => {
    const { updater, writer } = setup();
    writer.flashFirmware.mockResolvedValue({ status: 'firmware_written_normal_unconfirmed', chunksWritten: 4096, flashMayHaveChanged: true, firmwareVerified: true, normalProtocolVerified: false });
    const result = await updater.start();
    expect(result.phase).toBe('success');
    expect(writer.normalCheck).toHaveBeenCalledTimes(1);
    expect(writer.flashFirmware).toHaveBeenCalledTimes(1);
  });

  it('does not enter the bootloader if the connected device changes during preparation', async () => {
    const { updater, hid, manager, writer, journalPath } = setup();
    manager.pauseForFirmware.mockImplementationOnce(async () => { hid.devices.mockReturnValue([{ ...target, path: 'different-keyboard' }]); });
    const result = await updater.start();
    expect(result.phase).toBe('error');
    expect(result.recoveryRequired).toBe(false);
    expect(writer.flashFirmware).not.toHaveBeenCalled();
    expect(existsSync(journalPath)).toBe(false);
    expect(manager.resumeAfterFirmware).toHaveBeenCalledWith('s75pro', false);
  });

  it('offers the reviewed F105 image as a separate previous version', () => {
    const { updater } = setup();
    expect(updater.selectPrevious().selected).toMatchObject({ version: 'F105', source: 'previous' });
    expect(updater.selectBundled().selected).toMatchObject({ version: 'F106', source: 'bundled' });
  });

  it('does not start writing when the app settings backup fails', async () => {
    const { updater, options, writer, manager, journalPath } = setup();
    options.backup.mockImplementationOnce(() => { throw new Error('backup failed'); });
    const result = await updater.start();
    expect(result.phase).toBe('error');
    expect(writer.flashFirmware).not.toHaveBeenCalled();
    expect(existsSync(journalPath)).toBe(false);
    expect(manager.resumeAfterFirmware).toHaveBeenCalledWith('s75pro', false);
  });

  it('rechecks an already verified update without writing again', async () => {
    const { options, writer, manager, journalPath } = setup();
    writeFileSync(journalPath, JSON.stringify({
      targetVersion: 'F106',
      imageSha256: realWriter.validateImage(image).sha256,
      firmwareVerified: true, codeOptionsRestored: true, userModeRequested: true,
    }));
    const updater = new FirmwareUpdater(options);
    const result = await updater.recheck();
    expect(result.phase).toBe('success');
    expect(result.recoveryRequired).toBe(false);
    expect(writer.normalCheck).toHaveBeenCalledTimes(1);
    expect(writer.flashFirmware).not.toHaveBeenCalled();
    expect(existsSync(journalPath)).toBe(false);
    expect(manager.resumeAfterFirmware).toHaveBeenCalledWith('s75pro', false);
  });

  it('keeps an incomplete write blocked when no device checksum was recorded', async () => {
    const { options, writer, journalPath } = setup();
    writeFileSync(journalPath, JSON.stringify({ targetVersion: 'F106', imageSha256: realWriter.validateImage(image).sha256 }));
    const result = await new FirmwareUpdater(options).recheck();
    expect(result.recoveryRequired).toBe(true);
    expect(writer.normalCheck).not.toHaveBeenCalled();
    expect(writer.flashFirmware).not.toHaveBeenCalled();
    expect(existsSync(journalPath)).toBe(true);
  });
});
