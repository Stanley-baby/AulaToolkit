'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { normalDevices, decodeInfo, packet } = require('./MODIFIED_FILE.cjs');

const STOCK_SHA256 = '7ef0d72f267621beef543a8068602db253872a5a2a0291e4ccdb1a651e669e22';
const STOCK_PATH = path.resolve(__dirname, '../USB_IDENTITY_MATCH/alternate-firmware-4000.bin');
const CANDIDATE_SHA256 = '569c6e4d6748e27e55fa3865bbce3825d75595dea8c319b6bc7eb8a606474b0a';
const CANDIDATE_PATH = path.resolve(__dirname, '../CONNECTED_DARK/MODIFIED_FILE.bin');
const CUSTOM_SLEEP_SHA256 = 'bdcfce4a5d2cf3982e44451b7d971a6fc63595a1116776a4b90e9b506cc505b9';
const CUSTOM_SLEEP_PATH = path.resolve(__dirname, '../CUSTOM_SLEEP/MODIFIED_FILE.bin');
const RADIO_DARK_SHA256 = '347fdbef9c4806dcd5e4d7883c775dfabd926bd26ced0252ef33d0f50151b28e';
const RADIO_DARK_PATH = path.resolve(__dirname, '../../RADIO_CONNECTED_DARK_20261116/MODIFIED_FILE.bin');
const QUICK_WAKE_SHA256 = 'ed95aa99b162b8f3746288c02bc04e403b21c86e1792f9c8cb662b1c6c2e8ab3';
const QUICK_WAKE_PATH = path.resolve(__dirname, '../../QUICK_WAKE_SWITCH_20261116/MODIFIED_FILE.bin');
const SMART_SLEEP_SHA256 = '5f8425131cf96e8878dee95950380b7fa788004e91540fbcf30b49d9b2ef2931';
const SMART_SLEEP_PATH = path.resolve(__dirname, '../../SMART_SLEEP_20261117/MODIFIED_FILE.bin');
function checksum(image) {
  assert.equal(image.length % 2, 0);
  let sum = 0;
  for (let i = 0; i < image.length; i += 2) sum = (sum + image.readUInt16LE(i)) & 0xffff;
  return sum;
}
function validateImage(image) {
  assert.equal(image.length, 256 * 1024, 'Expected full SN32F29X User ROM');
  const sha256 = crypto.createHash('sha256').update(image).digest('hex');
  assert.ok([STOCK_SHA256, CANDIDATE_SHA256, CUSTOM_SLEEP_SHA256, RADIO_DARK_SHA256, QUICK_WAKE_SHA256, SMART_SLEEP_SHA256].includes(sha256), 'Expected a reviewed firmware image');
  const sp = image.readUInt32LE(0), reset = image.readUInt32LE(4);
  assert.ok(sp >= 0x20000000 && sp < 0x20008000 && (sp & 3) === 0);
  assert.ok((reset & 1) === 1 && reset < image.length);
  const sum = checksum(image);
  assert.equal(sum, sha256 === STOCK_SHA256 ? 0x1049 : sha256 === CANDIDATE_SHA256 ? 0x2bf9 : sha256 === CUSTOM_SLEEP_SHA256 ? 0x0dfb : sha256 === RADIO_DARK_SHA256 ? 0x42fc : sha256 === QUICK_WAKE_SHA256 ? 0x67cc : 0x025f);
  return { sha256, bytes: image.length, checksum: sum, pages: 256, chunks: 4096 };
}
function command(op) {
  assert.ok([1, 2, 3, 4, 5, 6, 7].includes(op));
  const b = Buffer.alloc(65);
  b[1] = op; b[2] = 0xaa; b[3] = 0x55;
  return b;
}
function payload(raw) {
  let b = Buffer.from(raw);
  if (b.length === 65 && b[0] === 0) b = b.subarray(1);
  assert.equal(b.length, 64, 'Expected a full ISP payload');
  return b;
}
function ack(raw, op) {
  const b = payload(raw);
  assert.equal(b.readUInt32LE(0), 0x55aa00 | op, 'Wrong ISP reply opcode');
  assert.equal(b.readUInt32LE(4), 0xfafafafa, 'ISP did not acknowledge');
  return b;
}
async function normalCheck(handle) {
  const read = Buffer.alloc(65); read[1] = 4; read[2] = 0xf5; read[9] = 9;
  const end = Buffer.alloc(65); end[1] = 4; end[2] = 2;
  let ok = false;
  try {
    assert.equal(handle.sendFeatureReport([...read]), 65);
    await delay(50);
    const a = payload(handle.getFeatureReport(0, 65));
    assert.ok(a[0] === 4 && a[1] === 0xf5 && a[3] === 1, 'Normal firmware did not answer light read');
    for (let i = 0; i < 9; i++) {
      await delay(1);
      payload(handle.getFeatureReport(0, 65));
    }
    ok = true;
  } finally { handle.sendFeatureReport([...end]); }
  return ok;
}
async function flashFirmware(hid, image, progress = () => {}) {
  const imageInfo = validateImage(image);
  const result = { status: 'preflight', image: imageInfo, stages: [], chunksWritten: 0,
    flashMayHaveChanged: false, firmwareVerified: false, normalProtocolVerified: false };
  let handle, inIsp = false;
  const stage = (name, detail = {}) => {
    result.status = name;
    result.stages.push({ name, ...detail });
    progress(result);
  };
  const send = b => assert.equal(handle.sendFeatureReport([...b]), 65, 'Incomplete HID write');
  const exchange = async (b, wait = 30) => {
    send(b);
    await delay(wait);
    return ack(handle.getFeatureReport(0, 65), b[1]);
  };
  try {
    const devices = normalDevices(hid.devices());
    assert.equal(devices.length, 1, 'Expected one wired S75Pro configuration interface');
    handle = new hid.HID(devices[0].path);
    send(Buffer.from(packet('entry')));
    await delay(1000);
    const info = await exchange(command(1), 100);
    inIsp = true;
    result.chip = decodeInfo(info);
    assert.ok(result.chip, 'Expected SN32F29X family5');
    result.originalCodeOption = info.readUInt16LE(12);
    assert.equal(result.originalCodeOption, 0xffff, 'Unreviewed code option');
    assert.ok([0xffff, 0x5a5a, 0xa5a5].includes(result.chip.securityRaw), 'Unreviewed protection value');
    stage('isp_verified', { security: result.chip.securityRaw });
    // Vendor updater 0x40abc0 erases code options with 02 before the 04 ROM erase.
    result.flashMayHaveChanged = true;
    stage('code_option_erase_started');
    await exchange(command(2), 100);
    stage('code_options_erased');
    const erase = command(4); erase.writeUInt16LE(256, 9);
    stage('user_rom_erase_started', { firstPage: 0, pages: 256 });
    const blank = await exchange(erase, 1000);
    assert.equal(blank.readUInt16LE(8), 0, 'Blank checksum mismatch');
    stage('user_rom_blank');
    const program = command(5); program.writeUInt32LE(4096, 9);
    await exchange(program, 100);
    stage('programming');
    for (let off = 0; off < image.length; off += 64) {
      const b = Buffer.alloc(65);
      image.copy(b, 1, off, off + 64);
      send(b);
      result.chunksWritten++;
      if (result.chunksWritten % 256 === 0) progress(result);
      await delay(1);
    }
    await delay(100);
    const last = ack(handle.getFeatureReport(0, 65), 5);
    assert.equal(last.readUInt16LE(8), imageInfo.checksum, 'Program checksum mismatch');
    assert.equal(last.readUInt32LE(60), image.readUInt32LE(image.length - 4), 'Last word mismatch');
    const check = await exchange(command(6), 100);
    assert.equal(check.readUInt16LE(8), imageInfo.checksum, 'Independent checksum mismatch');
    result.firmwareVerified = true;
    stage('firmware_checksum_verified', { checksum: imageInfo.checksum });
    const option = command(3);
    option.writeUInt16LE(result.originalCodeOption, 5);
    option.writeUInt16LE(result.chip.securityRaw, 7);
    await exchange(option, 100);
    stage('code_options_restored');
    send(command(7));
    inIsp = false;
    stage('user_mode_requested');
    handle.close(); handle = null;
    await delay(1500);
    const after = normalDevices(hid.devices());
    assert.equal(after.length, 1, 'Expected normal configuration interface');
    handle = new hid.HID(after[0].path);
    result.normalProtocolVerified = await normalCheck(handle);
    stage(imageInfo.sha256 === STOCK_SHA256 ? 'stock_flash_verified' : 'candidate_flash_verified');
  } catch (e) {
    result.error = e.message;
    stage(result.firmwareVerified && !inIsp ? 'firmware_written_normal_unconfirmed' :
      result.flashMayHaveChanged ? 'flash_incomplete_stay_in_isp' : 'preflight_failed');
  } finally {
    if (handle && inIsp && !result.flashMayHaveChanged) {
      try { send(command(7)); } catch (e) { result.exitError = e.message; }
    }
    if (handle) { try { handle.close(); } catch (e) { result.closeError = e.message; } }
  }
  return result;
}
module.exports = { STOCK_PATH, STOCK_SHA256, CANDIDATE_PATH, CANDIDATE_SHA256,
  CUSTOM_SLEEP_PATH, CUSTOM_SLEEP_SHA256, RADIO_DARK_PATH, RADIO_DARK_SHA256, QUICK_WAKE_PATH, QUICK_WAKE_SHA256,
  SMART_SLEEP_PATH, SMART_SLEEP_SHA256, checksum, validateImage, command, ack, normalCheck, flashFirmware };
