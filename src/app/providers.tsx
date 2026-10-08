"use client";

/**
 * Providers — wraps all client-side context providers.
 *
 * Uses usePathname() to detect if we're on a public page (login/register)
 * and skips the Screen/BottomNav wrapper for those pages.
 *
 * On the Dashboard, renders TWO floating action buttons:
 *   - LEFT:   QuickAddMenu (+ button) — manual entry options sheet
 *   - RIGHT:  HoldToRecordButton (microphone) — WhatsApp-style press-and-hold
 *             voice recording. TAP opens Smart Entry modal; HOLD starts
 *             recording immediately.
 *
 * The mic FAB is the primary, more prominent action; the + FAB is the
 * secondary, manual fallback.
 */

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { QueryProvider } from "@/providers/query-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { LanguageProvider } from "@/providers/language-provider";
import { AuthGate } from "@/providers/auth-gate";
import { Screen } from "@/components/layout/Screen";
import { BottomNav } from "@/components/layout/BottomNav";
import { QuickAddMenu } from "@/components/layout/QuickAddMenu";
import { HoldToRecordButton } from "@/components/smart-entry/HoldToRecordButton";

const PUBLIC_PAGES = ["/login", "/register"];

// The Dashboard is the only page where the FABs render. Every other section
// has its own header-level "+" action, so the floating buttons would just be
// visual noise there. Form/edit pages also hide the FABs.
const DASHBOARD_PATH = "/dashboard";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Both FABs render ONLY on /dashboard
  const showFab = !isPublicPage && pathname === DASHBOARD_PATH;

  return (
    <ThemeProvider>
      <LanguageProvider>
        <QueryProvider>
          <ToastProvider>
            {isPublicPage ? (
              <Screen>{children}</Screen>
            ) : (
              <AuthGate>
                <Screen>
                  {children}
                  <BottomNav />
                  {showFab ? (
                    <>
                      <QuickAddMenu />
                      <HoldToRecordButton />
                    </>
                  ) : null}
                </Screen>
              </AuthGate>
            )}
          </ToastProvider>
        </QueryProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
