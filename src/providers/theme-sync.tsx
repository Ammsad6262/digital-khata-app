"use client";

/**
 * ThemeSync — applies the signed-in user's saved theme as soon as their
 * settings load, on any page.
 *
 * Previously the only call site was the Settings screen, so a user opening the
 * app on a new device saw the default theme until they navigated to Settings.
 * Mounted inside AuthGate, so it never fires for signed-out visitors.
 *
 * A device-local choice still wins — see ThemeProvider.syncThemeFromServer.
 */

import { useEffect } from "react";
import { useSettings } from "@/hooks/use-settings";
import { useTheme } from "@/providers/theme-provider";

export function ThemeSync() {
  const { syncThemeFromServer } = useTheme();
  const { data } = useSettings();

  useEffect(() => {
    if (data?.theme) {
      syncThemeFromServer(data.theme);
    }
  }, [data?.theme, syncThemeFromServer]);

  return null;
}