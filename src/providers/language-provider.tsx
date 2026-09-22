"use client";

/**
 * LanguageProvider — manages app language (English/Urdu).
 *
 * - Stores choice in localStorage (persists across sessions)
 * - Applies `dir="rtl"` on <html> when Urdu is selected
 * - Applies `lang="ur"` on <html>
 * - Provides `t()` function for translations
 * - Anti-FOUC: inline script in layout.tsx sets dir before first paint
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

type LanguageContextValue = {
  lang: Language;
  dir: "ltr" | "rtl";
  setLang: (lang: Language) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "digital-khata-lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  // Load saved language on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === "ur" || stored === "en") {
        setLangState(stored);
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
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {}
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const entry = translations[key];
      if (!entry) return key;
      return entry[lang] ?? entry.en ?? key;
    },
    [lang],
  );

  const dir = lang === "ur" ? "rtl" : "ltr";

  return (
    <LanguageContext.Provider value={{ lang, dir, setLang, t }}>
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
    };
  }
  return ctx;
}
