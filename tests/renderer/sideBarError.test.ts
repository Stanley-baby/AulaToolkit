import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../src/renderer/src/apply', () => ({ schedule: vi.fn() }));
vi.mock('../../src/renderer/src/theme', () => ({ applyTheme: vi.fn(), initTheme: vi.fn() }));
import { useStore } from '../../src/renderer/src/store';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('reports side no-reply as an unconfirmed keyboard command, not mouse asleep or success', async () => {
  vi.useFakeTimers();
  const call = vi.fn().mockRejectedValue(new Error('SIDE_LIGHT_NO_REPLY'));
  vi.stubGlobal('window', { aula: { call } });
  useStore.setState({ prefs: { ...useStore.getState().prefs, language: 'zh' }, devices: [{ modelId: 's75pro', key: 's75pro:2.4g', link: '2.4g' }] as any, toasts: [] });
  await expect(useStore.getState().call('s75pro', 'setBarLight', 0x20)).rejects.toThrow('SIDE_LIGHT_NO_REPLY');
  expect(call).toHaveBeenCalledOnce();
  expect(useStore.getState().toasts).toEqual([expect.objectContaining({ text: '侧灯指令未收到键盘确认，请检查键盘已唤醒且接收器已连接后重试。', kind: 'error' })]);
  expect(useStore.getState().busy['s75pro:setBarLight']).toBe(false);
});
