// Locale registry. Each locale exports `<code>` (UI strings, typed against English) and `names`
// (device-level strings such as effect and action names, keyed by their English text).
import { en, type UiDict } from '@shared/locales/en';
import { tr, names as namesTr } from '@shared/locales/tr';
import { ru, names as namesRu } from '@shared/locales/ru';
import { zh, names as namesZh } from '@shared/locales/zh';
import { uk, names as namesUk } from '@shared/locales/uk';
import { vi, names as namesVi } from '@shared/locales/vi';
import { pt, names as namesPt } from '@shared/locales/pt';
import { es, names as namesEs } from '@shared/locales/es';
import { de, names as namesDe } from '@shared/locales/de';
import { fr, names as namesFr } from '@shared/locales/fr';

export type Lang = 'en' | 'tr' | 'ru' | 'zh' | 'uk' | 'vi' | 'pt' | 'es' | 'de' | 'fr';
export type TKey = keyof UiDict;

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'tr', label: 'Türkçe' }, { code: 'ru', label: 'Русский' }, { code: 'zh', label: '简体中文' },
  { code: 'uk', label: 'Українська' }, { code: 'vi', label: 'Tiếng Việt' }, { code: 'pt', label: 'Português (Brasil)' }, { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' }, { code: 'fr', label: 'Français' },
];

export const DICT: Record<Lang, UiDict> = { en, tr, ru, zh, uk, vi, pt, es, de, fr };
export const NAMES: Record<Lang, Record<string, string>> = { en: {}, tr: namesTr, ru: namesRu, zh: namesZh, uk: namesUk, vi: namesVi, pt: namesPt, es: namesEs, de: namesDe, fr: namesFr };

/** Picks the closest supported language for a BCP-47 tag. */
export function detectLang(tag: string): Lang {
  const base = tag.toLowerCase().split('-')[0];
  return (LANGUAGES.find((l) => l.code === base)?.code ?? 'en');
}
