import { create } from 'zustand';
import { vi, type TranslationDictionary } from './vi';
import { en } from './en';
import { ko } from './ko';

export type Language = 'vi' | 'en' | 'ko';

export interface LanguageOption {
  code: Language;
  shortLabel: string;
  label: string;
  intlLocale: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'vi', shortLabel: 'VI', label: 'Tiếng Việt', intlLocale: 'vi-VN' },
  { code: 'en', shortLabel: 'EN', label: 'English', intlLocale: 'en-US' },
  { code: 'ko', shortLabel: 'KO', label: '한국어', intlLocale: 'ko-KR' },
];

const LANG_STORAGE_KEY = 'ocr_platform_lang_v1';

const DICTIONARIES: Record<Language, TranslationDictionary> = {
  vi,
  en,
  ko,
};

const isSupportedLanguage = (val: string | null): val is Language =>
  val === 'vi' || val === 'en' || val === 'ko';

const getInitialLanguage = (): Language => {
  if (typeof window === 'undefined') return 'vi';
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (isSupportedLanguage(saved)) return saved;
  } catch {
    // ignore storage errors
  }
  return 'vi';
};

const syncHtmlLang = (lang: Language) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
};

type Primitive = string | number | boolean | null | undefined | readonly unknown[];
type DotKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends Primitive
    ? `${Prefix}${K}`
    : T[K] extends object
    ? DotKeys<T[K], `${Prefix}${K}.`>
    : never;
}[keyof T & string];

export type TranslationKey = DotKeys<TranslationDictionary>;

interface I18nState {
  lang: Language;
  setLang: (lang: Language) => void;
}

const initialLang = getInitialLanguage();
syncHtmlLang(initialLang);

export const useI18nStore = create<I18nState>((set) => ({
  lang: initialLang,
  setLang: (lang: Language) => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
    syncHtmlLang(lang);
    set({ lang });
  },
}));

const resolvePath = (obj: Record<string, any>, path: string): string | undefined => {
  const parts = path.split('.');
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
};

export const translate = (
  lang: Language,
  key: TranslationKey | string,
  vars?: Record<string, string | number>
): string => {
  const template =
    resolvePath(DICTIONARIES[lang], key) ??
    resolvePath(DICTIONARIES.en, key) ??
    resolvePath(DICTIONARIES.vi, key) ??
    key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : `{${k}}`
  );
};

export const getCurrentLang = (): Language => useI18nStore.getState().lang;

export const getIntlLocale = (lang: Language = getCurrentLang()): string => {
  return LANGUAGES.find((l) => l.code === lang)?.intlLocale || 'vi-VN';
};

export const useTranslation = () => {
  const lang = useI18nStore((s) => s.lang);
  const setLang = useI18nStore((s) => s.setLang);

  const t = (key: TranslationKey | string, vars?: Record<string, string | number>): string =>
    translate(lang, key, vars);

  const dict = DICTIONARIES[lang];

  return { lang, setLang, t, dict, intlLocale: getIntlLocale(lang) };
};

export {
  localizeCategory,
  localizeQuotaType,
  localizeServiceName,
  localizePackageName,
  localizeCapability,
  localizeLanguageLabel,
  localizeFeature,
  localizeService,
  localizeDocType,
  localizePackage,
} from './catalog';
