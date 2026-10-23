// Applies theme and accent preferences to the document; "system" follows Windows.
import type { AppPrefs } from '@shared/ipc';

export const ACCENTS: { id: string; name: string; hex: string }[] = [
  { id: 'ember', name: 'Ember', hex: '#ff5a1f' },
  { id: 'blue', name: 'Blue', hex: '#3b82f6' },
  { id: 'cyan', name: 'Cyan', hex: '#06b6d4' },
  { id: 'green', name: 'Green', hex: '#22c55e' },
  { id: 'purple', name: 'Purple', hex: '#8b5cf6' },
  { id: 'pink', name: 'Pink', hex: '#ec4899' },
  { id: 'red', name: 'Red', hex: '#ef4444' },
];

const media = window.matchMedia('(prefers-color-scheme: dark)');
let mediaBound = false;
let systemAccent = '#0078d4';

export async function initTheme(): Promise<void> {
  systemAccent = (await window.aula.systemAccent().catch(() => null)) ?? systemAccent;
}

const lighten = (hex: string, amt = 0.22): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * amt));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
};

export function applyTheme(p: AppPrefs): void {
  const root = document.documentElement;
  const resolve = (): void => {
    root.dataset.theme = p.theme === 'system' ? (media.matches ? 'dark' : 'light') : p.theme;
  };
  resolve();
  if (!mediaBound) { media.addEventListener('change', () => { if (document.documentElement.dataset.themeMode === 'system') resolve(); }); mediaBound = true; }
  root.dataset.themeMode = p.theme;
  const hex = p.accent === 'system' ? systemAccent : ACCENTS.find((a) => a.id === p.accent)?.hex ?? (p.accent?.startsWith('#') ? p.accent : '#ff5a1f');
  root.style.setProperty('--color-accent', hex);
  root.style.setProperty('--color-accent-2', lighten(hex));
}
