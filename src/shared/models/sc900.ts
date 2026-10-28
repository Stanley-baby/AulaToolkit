import type { DeviceModel } from '../types';

/**
 * AULA SC900 Pro and the SC900 versions that share its driver — PixArt 8K wireless platform.
 * (The SC900 V2 / Max use other ids, 38A6:xxxx, and the official AULA HUB app; not covered here.)
 * The vendor driver (Aula SC900PRO.exe) lists three id pairs (wired / dongle):
 *   093A:622C / 093A:522C ("PIXART_8K_DONGLE"), 248A:5B4A / 248A:5B49, 379A:0CF0 / 379A:0CEF.
 * Configuration goes over the vendor usage page 0xFF05 with 9-byte feature reports (id 0x09).
 */
export const SC900: DeviceModel = {
  id: 'sc900',
  name: 'SC900 Pro',
  brand: 'AULA',
  kind: 'mouse',
  protocol: 'incott',
  usb: [
    { vendorId: 0x093a, productId: 0x622c, role: 'usb', usagePage: 0xff05 },
    { vendorId: 0x093a, productId: 0x522c, role: 'dongle', usagePage: 0xff05 },
    { vendorId: 0x248a, productId: 0x5b4a, role: 'usb', usagePage: 0xff05 },
    { vendorId: 0x248a, productId: 0x5b49, role: 'dongle', usagePage: 0xff05 },
    { vendorId: 0x379a, productId: 0x0cf0, role: 'usb', usagePage: 0xff05 },
    { vendorId: 0x379a, productId: 0x0cef, role: 'dongle', usagePage: 0xff05 },
  ],
  image: 'sc900',
  gallery: ['sc900', 'sc900-2', 'sc900-3'],
  variants: [
    { id: 'red', name: 'Red', image: 'sc900', swatch: '#b3131a' },
    { id: 'white', name: 'White', image: 'sc900-2', swatch: '#f2f2f2' },
    { id: 'black', name: 'Black', image: 'sc900-3', swatch: '#1b1b1f' },
  ],
  tagline: 'Ultra-light tri-mode gaming mouse with dual 8K polling',
  verified: true,
  specs: [
    { label: 'Sensor', value: 'PixArt PAW3395 / PAW3950' },
    { label: 'DPI', value: '50 – 30 000' },
    { label: 'Polling', value: 'Up to 8000 Hz (2.4 GHz)' },
    { label: 'Switches', value: 'TTC optical' },
    { label: 'Weight', value: '≈ 50 g' },
    { label: 'Battery', value: '400 mAh swappable' },
  ],
  features: { dpi: true, buttons: true, macros: true, settings: true, battery: true },
  bluetoothName: 'SC900',
  buttonSlots: [
    { slot: 0, name: 'Left click', x: 36, y: 30, locked: true },
    { slot: 1, name: 'Right click', x: 64, y: 30 },
    { slot: 2, name: 'Middle click', x: 50, y: 24 },
    { slot: 4, name: 'Forward', x: 30, y: 41 },
    { slot: 3, name: 'Back', x: 30, y: 51 },
    { slot: 5, name: 'DPI button', x: 50, y: 14 },
  ],
  dpi: { min: 50, max: 30000, step: 50, stages: 6, defaults: [400, 800, 1600, 2400, 3200, 6400] },
  pollingRates: [125, 250, 500, 1000, 2000, 4000, 8000],
};
