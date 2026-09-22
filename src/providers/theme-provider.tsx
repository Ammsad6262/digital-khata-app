"use client";

/**
 * ThemeProvider — manages the app's color theme.
 *
 * Themes available:
 *   - "default"  — classic green palette
 *   - "leaf"     — Bright Leaf theme using #CDFF9B (accent) + #203D43 (dark)
 *
 * The selected theme is:
 *   1. Stored in localStorage (persists across sessions)
 *   2. Applied as data-theme attribute on <html> (CSS variables switch)
 *   3. Applied BEFORE first paint via an inline script in <head> to prevent
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

export type Theme = "default" | "leaf";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "digital-khata-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("default");

  // On mount: read from localStorage (or system default)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "leaf" || stored === "default") {
        setThemeState(stored);
      }
    } catch {
      // localStorage might be unavailable (private browsing) — use default
    }
  }, []);

  // Apply theme to <html> whenever it changes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "leaf") {
      root.setAttribute("data-theme", "leaf");
    } else {
      root.removeAttribute("data-theme");
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

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  // During static prerendering, ThemeProvider may not be mounted yet.
  // Return a no-op default instead of throwing — this prevents
  // "Cannot read properties of null (reading 'useContext')" errors
  // during `next build`'s static generation phase.
  if (!ctx) {
    return {
      theme: "default",
      setTheme: () => {},
    };
  }
  return ctx;
}
