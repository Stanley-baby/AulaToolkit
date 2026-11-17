import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Exercise the actual window factory without starting HID or Electron.
function create(platform: string, width = 1440, height = 900, theme = 'system', systemDark = false) {
  const source = readFileSync('src/main/index.ts', 'utf8');
  const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const factory = parsed.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === 'createWindow')!;
  const window = { on: vi.fn(), setWindowButtonVisibility: vi.fn(), loadFile: vi.fn(), webContents: { setWindowOpenHandler: vi.fn() } };
  let options: any;
  const BrowserWindow = function (opts: unknown) { options = opts; return window; };
  const code = ts.transpileModule(factory.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code + ';createWindow()', {
    BrowserWindow, screen: { getPrimaryDisplay: () => ({ workAreaSize: { width, height } }) },
    process: { platform }, iconPath: () => 'icon', join: (...p: string[]) => p.join('/'),
    __dirname: '/app/main', is: { dev: false }, startHidden: false,
    prefs: { theme }, nativeTheme: { shouldUseDarkColors: systemDark },
  });
  return { options, window };
}

describe('native macOS main window', () => {
  it.each([['light', true, '#f3f4f8'], ['dark', false, '#0b0d12'], ['system', false, '#f3f4f8'], ['system', true, '#0b0d12']])('starts with the %s preference background (system dark=%s)', (theme, systemDark, color) => {
    expect(create('darwin',1440,900,theme as string,systemDark as boolean).options.backgroundColor).toBe(color);
  });
  it('allows resizing, zoom and fullscreen and keeps native traffic lights', () => {
    const { options, window } = create('darwin');
    expect(options.resizable).toBe(true);
    expect(options.maximizable).toBe(true);
    expect(options.fullscreenable).toBe(true);
    expect(options.frame).toBe(true);
    expect(options.titleBarStyle).toBe('hidden');
    expect(options.trafficLightPosition).toEqual({ x: 16, y: 15 });
    expect(window.setWindowButtonVisibility).not.toHaveBeenCalledWith(false);
  });
  it('keeps the minimum and initial size within a small display', () => {
    const { options } = create('darwin', 800, 550);
    expect(options.width).toBeLessThanOrEqual(800);
    expect(options.height).toBeLessThanOrEqual(550);
    expect(options.minWidth).toBeLessThanOrEqual(options.width);
    expect(options.minHeight).toBeLessThanOrEqual(options.height);
  });
  it('preserves the existing Windows window behavior', () => {
    const { options } = create('win32');
    expect(options.frame).toBe(false);
    expect(options.resizable).toBe(false);
    expect(options.maximizable).toBe(false);
    expect(options.fullscreenable).toBe(false);
  });
});
