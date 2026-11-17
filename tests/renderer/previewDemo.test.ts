import { expect, it } from 'vitest';
import { PreviewDemo } from '../../src/renderer/src/previewDemo';
const start = () => { const d = new PreviewDemo(); d.select(2, 0); d.tick(0, true); return d; };
it('waits 5 seconds, demonstrates for 4 seconds, then never repeats', () => {
  const d = start();
  expect(d.tick(4999, true).playing).toBe(false);
  expect(d.tick(5000, true)).toEqual({ playing: true, trigger: true });
  expect(d.tick(8999, true).playing).toBe(true);
  expect(d.tick(9000, true).playing).toBe(false);
  expect(d.tick(60000, true).playing).toBe(false);
});
it('real input cancels either waiting or playback and does not re-arm on settings changes', () => {
  for (const time of [1000, 6000]) {
    const d = start(); d.tick(time, true); d.cancel(); d.select(2, time);
    expect(d.tick(60000, true).playing).toBe(false);
  }
});
it('pauses the timer and playback while unfocused', () => {
  const d = start(); d.tick(2000, true); d.tick(2000, false);
  expect(d.tick(60000, false).playing).toBe(false);
  expect(d.tick(60000, true).playing).toBe(false);
  expect(d.tick(63000, true).playing).toBe(true);
  d.tick(64000, false);
  expect(d.tick(90000, false).playing).toBe(false);
});
it('replays on request, and only a new reactive mode re-arms automatic playback', () => {
  const d = start(); d.cancel(); d.replay(1000);
  expect(d.tick(1000, true).playing).toBe(true);
  d.select(3, 2000); expect(d.tick(2000, true).playing).toBe(false);
  expect(d.tick(7000, true).playing).toBe(true);
  d.select(1, 8000); d.replay(8000);
  expect(d.tick(60000, true).playing).toBe(false);
});
