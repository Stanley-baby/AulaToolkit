import { describe, expect, it } from 'vitest';
import { parseMacBluetooth } from '../src/shared/macBluetooth';

describe('macOS Bluetooth profiler parsing', () => {
  it('keeps connection state and zero battery without inventing unavailable levels', () => {
    expect(parseMacBluetooth({ SPBluetoothDataType: [{ device_connected: [
      { 'AULA-S75Pro-1': { device_batteryLevelMain: '0%' } },
      { 'SC900': { device_batteryPercent: 100 } },
    ], device_not_connected: [{ 'AULA-S75Pro-2': {} }] }] })).toEqual([
      { name: 'AULA-S75Pro-1', connected: true, battery: 0 },
      { name: 'SC900', connected: true, battery: 100 },
      { name: 'AULA-S75Pro-2', connected: false, battery: null },
    ]);
  });
  it.each([null, {}, { SPBluetoothDataType: {} }, { SPBluetoothDataType: [null, { device_connected: [null, { Broken: null }] }] }])('ignores malformed structure: %j', (input) => {
    expect(parseMacBluetooth(input)).toEqual([]);
  });
  it.each(['unknown', '101%', '-1', '', '50% garbage'])('rejects invalid battery values: %s', (battery) => {
    expect(parseMacBluetooth({ SPBluetoothDataType: [{ device_connected: [{ Keyboard: { device_batteryLevel: battery } }] }] })[0].battery).toBeNull();
  });
});
