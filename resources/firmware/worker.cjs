'use strict';
const fs = require('node:fs');
const writer = require('./stock-flash.cjs');
const { normalDevices } = require('./MODIFIED_FILE.cjs');

const send = (message) => {
  try { process.parentPort.postMessage(message); } catch { /* the writer must finish even if the window closes */ }
};

process.parentPort.once('message', async ({ data }) => {
  try {
    const hid = require(data.hidModulePath);
    const image = Buffer.from(data.image);
    if (writer.validateImage(image).sha256 !== data.imageSha256) throw new Error('Firmware image changed');
    const targets = normalDevices(hid.devices());
    if (targets.length !== 1 || targets[0].path !== data.target.path || targets[0].release !== data.target.release) {
      throw new Error('The wired keyboard changed before the update began');
    }
    const result = await writer.flashFirmware(hid, image, (update) => {
      if (['isp_verified', 'firmware_checksum_verified', 'code_options_restored', 'user_mode_requested'].includes(update.status)) {
        const journal = JSON.parse(fs.readFileSync(data.journalPath, 'utf8'));
        if (journal.imageSha256 !== data.imageSha256) throw new Error('Firmware recovery record changed');
        if (update.status === 'isp_verified') {
          journal.originalCodeOption = update.originalCodeOption;
          journal.originalSecurity = update.chip?.securityRaw;
        }
        if (update.status === 'firmware_checksum_verified') journal.firmwareVerified = true;
        if (update.status === 'code_options_restored') journal.codeOptionsRestored = true;
        if (update.status === 'user_mode_requested') journal.userModeRequested = true;
        const next = `${data.journalPath}.tmp`;
        fs.writeFileSync(next, JSON.stringify(journal, null, 2));
        fs.renameSync(next, data.journalPath);
      }
      send({ type: 'progress', result: { status: update.status, chunksWritten: update.chunksWritten } });
    });
    send({ type: 'result', result });
  } catch (error) {
    send({ type: 'error', error: error.message });
  }
});
