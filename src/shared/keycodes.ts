// HID usage tables and action catalogues shared by the UI and the protocol encoders.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const HID_NAMES: Record<number, string> = {};
[...LETTERS].forEach((c, i) => (HID_NAMES[0x04 + i] = c));
['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach((c, i) => (HID_NAMES[0x1e + i] = c));
Object.assign(HID_NAMES, {
  0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space',
  0x2d: '-', 0x2e: '=', 0x2f: '[', 0x30: ']', 0x31: '\\', 0x32: 'Non-US #', 0x33: ';', 0x34: "'",
  0x35: '`', 0x36: ',', 0x37: '.', 0x38: '/', 0x39: 'Caps Lock',
  0x46: 'Print Screen', 0x47: 'Scroll Lock', 0x48: 'Pause', 0x49: 'Insert', 0x4a: 'Home',
  0x4b: 'Page Up', 0x4c: 'Delete', 0x4d: 'End', 0x4e: 'Page Down',
  0x4f: 'Right', 0x50: 'Left', 0x51: 'Down', 0x52: 'Up', 0x53: 'Num Lock',
  0x54: 'KP /', 0x55: 'KP *', 0x56: 'KP -', 0x57: 'KP +', 0x58: 'KP Enter',
  0x59: 'KP 1', 0x5a: 'KP 2', 0x5b: 'KP 3', 0x5c: 'KP 4', 0x5d: 'KP 5', 0x5e: 'KP 6',
  0x5f: 'KP 7', 0x60: 'KP 8', 0x61: 'KP 9', 0x62: 'KP 0', 0x63: 'KP .', 0x64: 'Non-US \\', 0x65: 'Menu',
  0xe0: 'L-Ctrl', 0xe1: 'L-Shift', 0xe2: 'L-Alt', 0xe3: 'L-Win', 0xe4: 'R-Ctrl', 0xe5: 'R-Shift', 0xe6: 'R-Alt', 0xe7: 'R-Win',
});
for (let i = 0; i < 12; i++) HID_NAMES[0x3a + i] = `F${i + 1}`;
for (let i = 0; i < 12; i++) HID_NAMES[0x68 + i] = `F${i + 13}`;

export const MODIFIERS: [string, number][] = [
  ['Ctrl', 0x01], ['Shift', 0x02], ['Alt', 0x04], ['Win', 0x08],
  ['R-Ctrl', 0x10], ['R-Shift', 0x20], ['R-Alt', 0x40], ['R-Win', 0x80],
];

const CODE_TO_HID: Record<string, number> = {
  Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c, Minus: 0x2d, Equal: 0x2e,
  BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
  Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39, PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
  Insert: 0x49, Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d, PageDown: 0x4e,
  ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52, NumLock: 0x53,
  NumpadDivide: 0x54, NumpadMultiply: 0x55, NumpadSubtract: 0x56, NumpadAdd: 0x57, NumpadEnter: 0x58,
  NumpadDecimal: 0x63, IntlBackslash: 0x64, ContextMenu: 0x65,
  ControlLeft: 0xe0, ShiftLeft: 0xe1, AltLeft: 0xe2, MetaLeft: 0xe3,
  ControlRight: 0xe4, ShiftRight: 0xe5, AltRight: 0xe6, MetaRight: 0xe7,
};
[...LETTERS].forEach((c, i) => (CODE_TO_HID[`Key${c}`] = 0x04 + i));
for (let i = 1; i <= 9; i++) CODE_TO_HID[`Digit${i}`] = 0x1d + i;
CODE_TO_HID.Digit0 = 0x27;
for (let i = 1; i <= 9; i++) CODE_TO_HID[`Numpad${i}`] = 0x58 + i;
CODE_TO_HID.Numpad0 = 0x62;
for (let i = 1; i <= 24; i++) CODE_TO_HID[`F${i}`] = i <= 12 ? 0x39 + i : 0x5b + i;

/** Maps a DOM KeyboardEvent.code to a HID usage. */
export const hidFromDomCode = (code: string): number | undefined => CODE_TO_HID[code];
export const hidName = (code: number): string => HID_NAMES[code] ?? `0x${code.toString(16).padStart(2, '0')}`;

export const isModifier = (code: number): boolean => code >= 0xe0 && code <= 0xe7;
/** Modifier HID usage (0xe0..0xe7) → bitmask bit. */
export const modifierBit = (code: number): number => 1 << (code - 0xe0);

export const modsLabel = (mods: number): string =>
  MODIFIERS.filter(([, bit]) => mods & bit).map(([n]) => n).join(' + ');

export const MOUSE_ACTIONS: { id: number; name: string }[] = [
  { id: 1, name: 'Left click' },
  { id: 3, name: 'Right click' },
  { id: 2, name: 'Middle click' },
  { id: 4, name: 'Double click' },
  { id: 5, name: 'Scroll up' },
  { id: 6, name: 'Scroll down' },
  { id: 7, name: 'Back (button 4)' },
  { id: 8, name: 'Forward (button 5)' },
];

export const MEDIA_ACTIONS: { name: string; usage: number }[] = [
  { name: 'Play / Pause', usage: 0xcd }, { name: 'Stop', usage: 0xb7 },
  { name: 'Previous track', usage: 0xb6 }, { name: 'Next track', usage: 0xb5 },
  { name: 'Volume +', usage: 0xe9 }, { name: 'Volume -', usage: 0xea }, { name: 'Mute', usage: 0xe2 },
  { name: 'Calculator', usage: 0x192 }, { name: 'E-mail', usage: 0x18a }, { name: 'Media player', usage: 0x183 },
  { name: 'My computer', usage: 0x194 }, { name: 'Browser home', usage: 0x223 },
  { name: 'Browser refresh', usage: 0x227 }, { name: 'Browser stop', usage: 0x226 },
  { name: 'Browser back', usage: 0x224 }, { name: 'Browser forward', usage: 0x225 },
  { name: 'Browser favourites', usage: 0x22a }, { name: 'Browser search', usage: 0x221 },
];

export const SHORTCUTS: { name: string; mods: number; code: number }[] = [
  { name: 'Copy (Ctrl+C)', mods: 0x01, code: 0x06 }, { name: 'Paste (Ctrl+V)', mods: 0x01, code: 0x19 },
  { name: 'Cut (Ctrl+X)', mods: 0x01, code: 0x1b }, { name: 'Undo (Ctrl+Z)', mods: 0x01, code: 0x1d },
  { name: 'Redo (Ctrl+Y)', mods: 0x01, code: 0x1c }, { name: 'Save (Ctrl+S)', mods: 0x01, code: 0x16 },
  { name: 'Select all (Ctrl+A)', mods: 0x01, code: 0x04 }, { name: 'Find (Ctrl+F)', mods: 0x01, code: 0x09 },
  { name: 'New tab (Ctrl+T)', mods: 0x01, code: 0x17 }, { name: 'Close tab (Ctrl+W)', mods: 0x01, code: 0x1a },
  { name: 'Task manager', mods: 0x03, code: 0x29 }, { name: 'Alt+Tab', mods: 0x04, code: 0x2b },
  { name: 'Alt+F4', mods: 0x04, code: 0x3d }, { name: 'Show desktop (Win+D)', mods: 0x08, code: 0x07 },
  { name: 'Explorer (Win+E)', mods: 0x08, code: 0x08 }, { name: 'Lock PC (Win+L)', mods: 0x08, code: 0x0f },
  { name: 'Run (Win+R)', mods: 0x08, code: 0x15 }, { name: 'Screenshot (Win+Shift+S)', mods: 0x0a, code: 0x16 },
];
