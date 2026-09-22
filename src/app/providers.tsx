"use client";

/**
 * Providers — wraps all client-side context providers.
 *
 * Extracted into a separate client component so the root layout can stay
 * as a server component. This also helps with Next.js 16 Turbopack's
 * prerendering of /_global-error — the providers are only mounted on the
 * client, not during static generation.
 */

import { type ReactNode } from "react";
import { QueryProvider } from "@/providers/query-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { LanguageProvider } from "@/providers/language-provider";
import { AuthGate } from "@/providers/auth-gate";
import { Screen } from "@/components/layout/Screen";
import { BottomNav } from "@/components/layout/BottomNav";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <QueryProvider>
          <ToastProvider>
            <AuthGate>
              <Screen>
                {children}
                <BottomNav />
              </Screen>
            </AuthGate>
          </ToastProvider>
        </QueryProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
