"use client";

/**
 * Providers — wraps all client-side context providers.
 *
 * Two SEPARATE assistant products are mounted for every signed-in page
 * (except printable receipts):
 *
 *   - VoiceAssistant  — the universal, mic-first assistant (speak naturally).
 *   - AssistantWidget — the typed Khata Assistant (prepared commands + chat).
 *
 * They share the same backend engine but are distinct experiences. Neither
 * exposes developer details; those live at /admin/diagnostics.
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
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { VoiceAssistant } from "@/components/voice-assistant/VoiceAssistant";

const PUBLIC_PAGES = ["/login", "/register", "/reset-password", "/admin"];
const DASHBOARD_PATH = "/dashboard";
// Printable receipts render without the app chrome, so the paper is the page.
const RECEIPT_PATH = /^\/sales\/[^/]+\/receipt$/;

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isReceiptPage = RECEIPT_PATH.test(pathname);

  const showQuickAdd = !isPublicPage && pathname === DASHBOARD_PATH;

  return (
    <ThemeProvider>
      <LanguageProvider>
        <QueryProvider>
          <ToastProvider>
            {isPublicPage ? (
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
                    {/* Two separate products: universal voice + typed chat. */}
                    <VoiceAssistant />
                    <AssistantWidget />
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
