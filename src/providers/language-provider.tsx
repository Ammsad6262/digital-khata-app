"use client";

/**
 * LanguageProvider — manages app language (English/Urdu).
 *
 * - Server-rendered from the `digital-khata-lang` cookie, so the first paint is
 *   already in the owner's language (no English flash before hydration).
 * - Stores the choice in localStorage AND the cookie.
 * - Applies `dir="rtl"` on <html> when Urdu is selected
 * - Applies `lang="ur"` on <html>
 * - Provides `t()` function for translations
 * - Provides `tParams()` for parameterised translations
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { translations, type Language, type TranslationKey } from "@/lib/i18n/translations";
import { interpolate } from "@/lib/i18n/interpolate";

type LanguageContextValue = {
  lang: Language;
  dir: "ltr" | "rtl";
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  /** Translate a key with parameter interpolation. {placeholder} → params.placeholder */
  tParams: (key: TranslationKey, params: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "digital-khata-lang";

/** Persist the choice for the server render (cookie) and offline (localStorage). */
function persistLanguage(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  try {
    document.cookie = `${STORAGE_KEY}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {}
}

export function LanguageProvider({
  children,
  initialLanguage = "en",
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [lang, setLangState] = useState<Language>(initialLanguage);

  // Adopt a choice saved before this deploy (localStorage only) and write the
  // cookie so the next server render starts in the right language.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === "ur" || stored === "en") {
        setLangState(stored);
        document.cookie = `${STORAGE_KEY}=${stored}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch {}
  }, []);

  // Apply dir + lang to <html> when language changes
  useEffect(() => {
    const root = document.documentElement;
    if (lang === "ur") {
      root.setAttribute("dir", "rtl");
      root.setAttribute("lang", "ur");
    } else {
      root.setAttribute("dir", "ltr");
      root.setAttribute("lang", "en");
    }
  }, [lang]);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    persistLanguage(newLang);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const entry = translations[key];
      if (!entry) return key;
      return entry[lang] ?? entry.en ?? key;
    },
    [lang],
  );

  const tParams = useCallback(
    (key: TranslationKey, params: Record<string, string | number>): string => {
      const entry = translations[key];
      if (!entry) return key;
      const template = entry[lang] ?? entry.en ?? key;
      return interpolate(template, params);
    },
    [lang],
  );

  const dir = lang === "ur" ? "rtl" : "ltr";

  return (
    <LanguageContext.Provider value={{ lang, dir, setLang, t, tParams }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  // During static prerendering, LanguageProvider may not be mounted yet.
  // Return a no-op default instead of throwing — this prevents
  // "Cannot read properties of null (reading 'useContext')" errors
  // during `next build`'s static generation phase.
  if (!ctx) {
    return {
      lang: "en",
      dir: "ltr",
      setLang: () => {},
      t: (key: TranslationKey) => key as string,
      tParams: (key: TranslationKey) => key as string,
    };
  }
  return ctx;
}
