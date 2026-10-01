"use client";

/**
 * ThemeProvider — manages the app's color theme.
 *
 * Themes available:
 *   - "monochrome" — premium Black & White theme (DEFAULT for new users)
 *   - "default"    — classic green palette
 *   - "leaf"       — Bright Leaf theme using #CDFF9B (accent) + #203D43 (dark)
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
 *   setTheme("leaf");
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type Theme = "monochrome" | "default" | "leaf";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Sync theme to server-side settings (called after login or when settings load) */
  syncThemeFromServer: (serverTheme: string | null) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "digital-khata-theme";

/** The default theme for new users / first-time visitors. */
const DEFAULT_THEME: Theme = "monochrome";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  // On mount: read from localStorage (or use default)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "monochrome" || stored === "leaf" || stored === "default") {
        setThemeState(stored);
      } else {
        // No stored preference → use the default (monochrome)
        setThemeState(DEFAULT_THEME);
      }
    } catch {
      // localStorage might be unavailable (private browsing) — use default
    }
  }, []);

  // Apply theme to <html> whenever it changes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "default") {
      // Default theme = no data-theme attribute (uses :root CSS variables)
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
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
    if (!serverTheme) return;
    // Map server theme string to Theme type
    const validThemes: Theme[] = ["monochrome", "default", "leaf"];
    if (validThemes.includes(serverTheme as Theme)) {
      const serverT = serverTheme as Theme;
      // Only update if different from current (avoid unnecessary re-renders)
      setThemeState((current) => {
        if (current !== serverT) {
          try {
            localStorage.setItem(STORAGE_KEY, serverT);
          } catch {}
          return serverT;
        }
        return current;
      });
    }
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
