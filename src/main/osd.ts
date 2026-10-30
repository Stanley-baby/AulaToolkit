// On-screen display: a small, click-through pill that confirms a change made on the hardware (the mouse
// DPI button) or from the CLI. Like G HUB / Legion Toolkit's OSD. Position, duration, stacking level and
// "every display" come from the user's preferences (configureOsd). One window per display is created on
// demand, stays loaded and is shown inactive, so it never steals focus.
import { BrowserWindow, screen, type Display } from 'electron';
import { join } from 'node:path';
import { is } from '@electron-toolkit/utils';
import { CH, type OsdOptions, type OsdPayload } from '@shared/ipc';

const WIDTH = 340;
const HEIGHT = 96;
const BOTTOM_GAP = 72; // distance above the taskbar / work-area bottom
const EDGE_GAP = 24;
const DURATION_MS: Record<OsdOptions['duration'], number> = { short: 900, normal: 1600, long: 3200 };

interface Slot { win: BrowserWindow; loaded: boolean; queued: OsdPayload | null }

const slots = new Map<number, Slot>();
let hideTimer: NodeJS.Timeout | null = null;
let opts: OsdOptions = { onTop: true, allDisplays: false, position: 'bottom-center', duration: 'normal' };

export function configureOsd(next: OsdOptions): void {
  opts = next;
  for (const s of slots.values()) if (!s.win.isDestroyed()) applyLevel(s.win);
}

/** Above full-screen apps when requested, otherwise an ordinary always-on-top window. */
function applyLevel(win: BrowserWindow): void {
  win.setAlwaysOnTop(true, opts.onTop ? 'screen-saver' : 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: opts.onTop });
}

function slotFor(displayId: number): Slot {
  const existing = slots.get(displayId);
  if (existing && !existing.win.isDestroyed()) return existing;
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true },
  });
  const slot: Slot = { win, loaded: false, queued: null };
  applyLevel(win);
  win.setIgnoreMouseEvents(true);
  win.setVisibleOnAllWorkspaces(true);
  win.webContents.on('did-finish-load', () => {
    slot.loaded = true;
    if (slot.queued) { const p = slot.queued; slot.queued = null; win.webContents.send(CH.OSD_SHOW, p); }
  });
  if (is.dev && process.env.ELECTRON_RENDERER_URL) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#osd`);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'osd' });
  slots.set(displayId, slot);
  return slot;
}

/** Pre-creates the window for the primary display so the first OSD appears without delay. */
export function createOsd(): void {
  slotFor(screen.getPrimaryDisplay().id);
}

function place(win: BrowserWindow, display: Display): void {
  const a = display.workArea;
  const [v, h] = opts.position === 'center' ? ['center', 'center'] : opts.position.split('-');
  const x = h === 'left' ? a.x + EDGE_GAP : h === 'right' ? a.x + a.width - WIDTH - EDGE_GAP : a.x + (a.width - WIDTH) / 2;
  const y = v === 'top' ? a.y + EDGE_GAP : v === 'bottom' ? a.y + a.height - HEIGHT - BOTTOM_GAP : a.y + (a.height - HEIGHT) / 2;
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: HEIGHT });
}

/** The OSD window, for development screenshots. */
export const osdWindow = (): BrowserWindow | null => {
  const s = slots.get(screen.getPrimaryDisplay().id);
  return s && !s.win.isDestroyed() ? s.win : null;
};

export function showOsd(p: OsdPayload): void {
  // The display the user is looking at (the one under the cursor), or all of them.
  const displays = opts.allDisplays ? screen.getAllDisplays() : [screen.getDisplayNearestPoint(screen.getCursorScreenPoint())];
  const shown = new Set<number>();
  for (const d of displays) {
    const slot = slotFor(d.id);
    shown.add(d.id);
    place(slot.win, d);
    if (slot.loaded) slot.win.webContents.send(CH.OSD_SHOW, p); else slot.queued = p;
    slot.win.showInactive();
  }
  // A previous OSD on another display (cursor moved, or "all displays" switched off) goes away now.
  for (const [id, s] of slots) if (!shown.has(id) && !s.win.isDestroyed()) s.win.hide();
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { for (const s of slots.values()) if (!s.win.isDestroyed()) s.win.hide(); }, DURATION_MS[opts.duration]);
}
