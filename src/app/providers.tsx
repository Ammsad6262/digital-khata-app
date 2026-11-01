"use client";

/**
 * Providers — wraps all client-side context providers.
 *
 * The application-wide Khata Assistant is mounted here for every signed-in
 * page (except printable receipts). It replaced the dashboard-only
 * hold-to-talk button: one conversation, able to work across all modules.
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
                    {/* One assistant for the whole app, on every screen. */}
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
