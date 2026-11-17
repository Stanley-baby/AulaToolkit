'use strict';
const fs = require('node:fs');
const path = require('node:path');
const image = fs.readFileSync(path.join(__dirname, '../../resources/firmware/S75Pro-F106.bin'));
const target = { vendorId: 0x0c45, productId: 0x800a, product: 'AULA-S75Pro', usagePage: 0xff13, usage: 1, release: 0xf106, path: 'fake-wired-keyboard' };
exports.devices = () => [target];
exports.HID = class {
  constructor() { this.last = 0; this.chunks = 0; this.programming = false; this.programmed = false; }
  sendFeatureReport(raw) {
    const b = Buffer.from(raw);
    if (this.programming) {
      if (++this.chunks === 4096) { this.programming = false; this.programmed = true; }
      return 65;
    }
    if (b.subarray(1, 9).equals(Buffer.from('aa42895aff7162cc', 'hex'))) return 65;
    if (b[1] === 4 && b[2] === 0xf5) { this.last = 'normal'; return 65; }
    if (b[1] === 4 && b[2] === 2) return 65;
    this.last = b[1];
    return 65;
  }
  getFeatureReport() {
    const b = Buffer.alloc(65);
    if (this.last === 'normal') { b[1] = 4; b[2] = 0xf5; b[4] = 1; return [...b]; }
    b[1] = Number(this.last); b[2] = 0xaa; b[3] = 0x55; b.writeUInt32LE(0xfafafafa, 5);
    if (this.last === 1) { b[9] = 32; b[10] = 5; b.writeUInt16LE(0xffff, 13); b.writeUInt16LE(0x5a5a, 15); }
    if (this.last === 5 && !this.programmed) this.programming = true;
    if ((this.last === 5 && this.programmed) || this.last === 6) {
      b.writeUInt16LE(0x025f, 9);
      image.copy(b, 61, image.length - 4);
    }
    return [...b];
  }
  close() {}
};
