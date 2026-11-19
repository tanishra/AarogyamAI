'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * Minimal i18n — dictionary-based `t(key)` with interpolation `{name}`.
 * Locale persists in localStorage; falls back to `en` for missing keys.
 */

import en from './i18n/en';
import hi from './i18n/hi';

export type Locale = 'en' | 'hi';
const DICTIONARIES: Record<Locale, Record<string, string>> = { en, hi };

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = 'aarogyam.locale';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'en';
    return (window.localStorage.getItem(STORAGE_KEY) as Locale) || 'en';
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key;
      for (const [k, v] of Object.entries(vars ?? {})) {
        text = text.replace(`{${k}}`, String(v));
      }
      return text;
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
