"use client";

/**
 * ThemeProvider — manages the app's colour theme.
 *
 * Themes available:
 *   - "ink"      — warm graphite + ember (DEFAULT — premium ledger paper)
 *   - "emerald"  — deep emerald + gold (money / growth)
 *   - "saffron"  — marigold + teal (bazaar warmth)
 *   - "indigo"   — indigo + teal (modern fintech)
 *   - "rose"     — rosewood + gold (confident & warm)
 *
 * The selected theme is:
 *   1. Stored in localStorage (persists across sessions for instant load)
 *   2. Synced to the server-side Setting table (per-user, so User A's theme
 *      doesn't affect User B)
 *   3. Applied as data-theme attribute on <html> (CSS variables switch)
 *   4. Applied BEFORE first paint via an inline script in <head> to prevent
 *      flash of wrong theme (FOUC)
 *
 * Usage:
 *   const { theme, setTheme } = useTheme();
 *   setTheme("emerald");
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type Theme = "ink" | "emerald" | "saffron" | "indigo" | "rose";

export const THEMES: readonly Theme[] = [
  "ink",
  "emerald",
  "saffron",
  "indigo",
  "rose",
] as const;

/** Map ids saved by older builds onto the current palette. */
const LEGACY_THEMES: Record<string, Theme> = {
  monochrome: "ink",
  default: "emerald",
  leaf: "emerald",
};

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Sync theme to server-side settings (called after login or when settings load) */
  syncThemeFromServer: (serverTheme: string | null) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "digital-khata-theme";

/** The default theme for new users / first-time visitors. */
const DEFAULT_THEME: Theme = "ink";

function normalizeTheme(value: string | null | undefined): Theme | null {
  if (!value) return null;
  if (LEGACY_THEMES[value]) return LEGACY_THEMES[value];
  if ((THEMES as readonly string[]).includes(value)) return value as Theme;
  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  // On mount: read from localStorage (or use default)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const normalized = normalizeTheme(stored);
      if (normalized) {
        setThemeState(normalized);
        if (normalized !== stored) {
          localStorage.setItem(STORAGE_KEY, normalized);
        }
      } else {
        setThemeState(DEFAULT_THEME);
      }
    } catch {
      // localStorage might be unavailable (private browsing) — use default
    }
  }, []);

  // Apply theme to <html> whenever it changes
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // Ignore storage errors
    }
  }, []);

  /** Sync theme from server-side settings (called when settings load after login). */
  const syncThemeFromServer = useCallback((serverTheme: string | null) => {
    const normalized = normalizeTheme(serverTheme);
    if (!normalized) return;

    // A theme the user explicitly chose on this device is stored in
    // localStorage and must win. The server copy can be stale (the settings
    // query may still hold the pre-change value while a PATCH is in flight),
    // and syncing it back is what reset the theme to the default after
    // navigating away from Settings.
    let hasLocalChoice = false;
    try {
      hasLocalChoice = normalizeTheme(localStorage.getItem(STORAGE_KEY)) !== null;
    } catch {
      // localStorage unavailable — fall back to the server value.
    }
    if (hasLocalChoice) return;

    setThemeState(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, syncThemeFromServer }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  // During static prerendering, ThemeProvider may not be mounted yet.
  if (!ctx) {
    return {
      theme: DEFAULT_THEME,
      setTheme: () => {},
      syncThemeFromServer: () => {},
    };
  }
  return ctx;
}