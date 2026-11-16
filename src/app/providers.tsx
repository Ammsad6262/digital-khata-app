"use client";

/**
 * Providers — wraps all client-side context providers.
 *
 * Two SEPARATE assistant products are mounted for every signed-in page
 * (except printable receipts):
 *
 *   - VoiceAssistant  — the universal, mic-first assistant (speak → confirm).
 *   - KhataAssistant  — business intelligence: 20 prepared questions + custom
 *                       questions, answered from the owner's own records.
 *
 * They have separate launchers, panels and responsibilities. Neither exposes
 * developer details; those live at /admin/diagnostics.
 */

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { QueryProvider } from "@/providers/query-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { LanguageProvider } from "@/providers/language-provider";
import { AuthGate } from "@/providers/auth-gate";
import { Screen } from "@/components/layout/Screen";
import { BottomNav } from "@/components/layout/BottomNav";
import { QuickAddMenu } from "@/components/layout/QuickAddMenu";
import { VoiceAssistant } from "@/components/voice-assistant/VoiceAssistant";
import { KhataAssistant } from "@/components/khata-assistant/KhataAssistant";

const PUBLIC_PAGES = ["/login", "/register", "/reset-password", "/admin"];
const DASHBOARD_PATH = "/dashboard";
// The public marketing page. It must NOT go through AuthGate: signed-out
// visitors need to read it (that is what search engines index), and signed-in
// owners are redirected to /dashboard by the page itself, server-side.
const LANDING_PATH = "/";
// Printable receipts render without the app chrome, so the paper is the page.
const RECEIPT_PATH = /^\/sales\/[^/]+\/receipt$/;
// Developer style guide — renders the real components with mock data.
const PREVIEW_PATH = "/preview";

/**
 * AI is a premium feature. Ask the server once whether this account may use it;
 * a permanent REGULAR licence (Rs 10,000 one-time) reports `aiEnabled: false`,
 * so the launchers are hidden. The real gate is server-side — every AI route
 * calls `requireAiAccess` — so hiding the button is only cosmetic.
 */
function useAiAccess(): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/assistant/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: { aiEnabled?: boolean } } | null) => {
        if (alive && json?.data && typeof json.data.aiEnabled === "boolean") {
          setEnabled(json.data.aiEnabled);
        }
      })
      .catch(() => {
        /* keep the default; a network blip must not hide a paid feature */
      });
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

export function Providers({
  children,
  initialLanguage = "en",
}: {
  children: ReactNode;
  initialLanguage?: "en" | "ur";
}) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isLandingPage = pathname === LANDING_PATH;
  const isReceiptPage = RECEIPT_PATH.test(pathname);
  const isPreviewPage = pathname === PREVIEW_PATH;

  const showQuickAdd = !isPublicPage && pathname === DASHBOARD_PATH;
  // Form screens pin a Save/Cancel bar above the bottom nav. The two assistant
  // launchers sit in that same band, so hide them here rather than cover the
  // primary action (their panels are still available from list/detail screens).
  const isFormPage =
    /\/(new|edit)$/.test(pathname) || /^\/stock\/(add|adjust)$/.test(pathname);
  // AI is premium-only: hide the launchers for a REGULAR (Rs 10,000) licence.
  const aiEnabled = useAiAccess();
  const showAi = !isFormPage && aiEnabled;

  return (
    <ThemeProvider>
      <LanguageProvider initialLanguage={initialLanguage}>
        <QueryProvider>
          <ToastProvider>
            {isPreviewPage ? (
              <Screen>
                {children}
                <BottomNav />
              </Screen>
            ) : isPublicPage || isLandingPage ? (
              <Screen>{children}</Screen>
            ) : (
              <AuthGate>
                {isReceiptPage ? (
                  children
                ) : (
                  <Screen>
                    {children}
                    <BottomNav />
                    {showQuickAdd ? <QuickAddMenu /> : null}
                    {/* Two separate products: voice actions + business intelligence. */}
                    {showAi ? <VoiceAssistant /> : null}
                    {showAi ? <KhataAssistant /> : null}
                  </Screen>
                )}
              </AuthGate>
            )}
          </ToastProvider>
        </QueryProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
