'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { setTimeout: delay } = require('node:timers/promises');

function normalDevices(devices) {
  return devices.filter(d => d.vendorId === 0x0c45 && d.productId === 0x800a &&
    d.product === 'AULA-S75Pro' && d.usagePage === 0xff13 && d.usage === 1);
}
function decodeInfo(bytes) {
  let b = Buffer.from(bytes);
  if (b.length === 65 && b[0] === 0) b = b.subarray(1);
  if (b.length !== 64 || !b.subarray(0, 8).equals(Buffer.from('01aa5500fafafafa', 'hex')) ||
      b[8] !== 32 || b[9] !== 5) return null;
  return { family: 'SN32F29X', familyCode: b[9], revision: b[11],
    securityRaw: b.readUInt16LE(14), rawHex: b.toString('hex') };
}
function packet(kind) {
  const b = Buffer.alloc(65);
  if (kind === 'entry') Buffer.from('aa42895aff7162cc', 'hex').copy(b, 1);
  else {
    assert.ok(kind === 'info' || kind === 'exit');
    b[1] = kind === 'info' ? 1 : 7;
    b[2] = 0xaa;
    b[3] = 0x55;
  }
  return [...b];
}
async function roundtrip(hid) {
  const result = { status: 'not_started', writes: [], events: [], info: null, returnedNormal: false };
  const enumerate = () => hid.devices();
  const start = normalDevices(enumerate());
  assert.equal(start.length, 1, 'Expected one wired S75Pro configuration interface');
  assert.equal(enumerate().filter(d => d.vendorId === 0x0c45 && d.productId === 0x7140).length, 0,
    'A bootloader was already present');
  let handle;
  const send = kind => {
    const bytes = packet(kind);
    result.writes.push({ kind, hex: Buffer.from(bytes).toString('hex') });
    const count = handle.sendFeatureReport(bytes);
    result.events.push({ kind, writtenBytes: count });
    assert.equal(count, bytes.length, 'Incomplete feature report');
  };
  let exitTarget = false;
  try {
    handle = new hid.HID(start[0].path);
    send('entry');
    handle.close();
    handle = null;
    await delay(1000);
    const all = enumerate();
    const boot = [...new Map(all.filter(d => d.vendorId === 0x0c45 && d.productId === 0x7140)
      .map(d => [d.path, d])).values()];
    assert.ok(boot.length <= 1, 'Ambiguous bootloader interfaces');
    const candidates = boot.length ? boot : normalDevices(all);
    result.events.push({ kind: 'after_entry', bootInterfaces: boot.length, normalInterfaces: normalDevices(all).length });
    assert.equal(candidates.length, 1, 'No unique query target after entry');
    exitTarget = boot.length === 1;
    handle = new hid.HID(candidates[0].path);
    send('info');
    await delay(100);
    const raw = handle.getFeatureReport(0, 65);
    result.events.push({ kind: 'info_reply', hex: Buffer.from(raw).toString('hex') });
    result.info = decodeInfo(raw);
    const reply = Buffer.from(raw);
    const payload = reply.length === 65 && reply[0] === 0 ? reply.subarray(1) : reply;
    exitTarget ||= payload.length === 64 && payload.subarray(0, 8).equals(Buffer.from('01aa5500fafafafa', 'hex'));
    result.status = result.info ? 'bootloader_identity_verified' : 'unrecognized_info_reply';
  } catch (e) {
    result.status = 'probe_error';
    result.error = e.message;
  } finally {
    if (handle && exitTarget) {
      try { send('exit'); } catch (e) { result.exitError = e.message; }
    }
    if (handle) {
      try { handle.close(); } catch (e) { result.closeError = e.message; }
    }
    for (let n = 0; n < 15; n++) {
      await delay(200);
      if (normalDevices(enumerate()).length === 1) {
        result.returnedNormal = true;
        break;
      }
    }
  }
  if (result.info && result.returnedNormal && !result.exitError) result.status = 'roundtrip_verified';
  return result;
}
async function run(args, hid) {
  if (['--flash-stock', '--flash-candidate'].includes(args[0]) && args.length === 1) {
    const stock = require('./stock-flash.cjs');
    const output = process.argv[3];
    const imagePath = args[0] === '--flash-stock' ? stock.STOCK_PATH : stock.CANDIDATE_PATH;
    return stock.flashFirmware(hid, fs.readFileSync(imagePath), r => {
      if (output) fs.writeFileSync(output, JSON.stringify(r, null, 2) + '\n');
      if (r.status !== 'programming' || r.chunksWritten % 1024 === 0)
        console.log(JSON.stringify({ stage: r.status, chunksWritten: r.chunksWritten }));
    });
  }
  if (args[0] === '--roundtrip' && args.length === 1) return roundtrip(hid);
  assert.deepEqual(args, ['--inspect']);
  return { status: 'passive_inspection', normalInterfaces: normalDevices(hid.devices()).length,
    writes: [] };
}
module.exports = { normalDevices, decodeInfo, packet, run };
if (require.main === module) {
  if (process.argv[2] === '--self-test') {
    const d = { vendorId: 0x0c45, productId: 0x800a, product: 'AULA-S75Pro', usagePage: 0xff13, usage: 1 };
    assert.equal(normalDevices([d, { ...d, productId: 0x0188 }, { ...d, usagePage: 1 }]).length, 1);
    assert.equal(decodeInfo(Buffer.alloc(64)), null);
    const ok = Buffer.alloc(64);
    Buffer.from('01aa5500fafafafa2005', 'hex').copy(ok);
    assert.equal(decodeInfo(ok).family, 'SN32F29X');
    assert.equal(decodeInfo(Buffer.concat([Buffer.from([0]), ok])).family, 'SN32F29X');
    assert.equal(decodeInfo(ok.subarray(0, 16)), null);
    const echo = Buffer.from(packet('info'));
    echo[5] = 0xff;
    assert.equal(decodeInfo(echo), null);
    assert.throws(() => packet('erase'));
    assert.deepEqual(['entry', 'info', 'exit'].map(k => packet(k).length), [65, 65, 65]);
    console.log('PASS: wired target, strict SN32F29X ACK, echo/truncation rejection; only entry/info/exit packets');
  } else {
    const hid = require(path.resolve(__dirname, '../../../AulaToolkit-mac/node_modules/node-hid'));
    run(process.argv.slice(2, 3), hid).then(r => {
      fs.writeFileSync(process.argv[3], JSON.stringify(r, null, 2) + '\n');
      console.log(JSON.stringify(r));
      if (!['passive_inspection', 'roundtrip_verified', 'stock_flash_verified', 'candidate_flash_verified'].includes(r.status)) process.exitCode = 2;
    }).catch(e => { console.error(e.message); process.exitCode = 2; });
  }
}
