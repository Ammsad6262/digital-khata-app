"use client";

/**
 * Providers — wraps all client-side context providers.
 *
 * Uses usePathname() to detect if we're on a public page (login/register)
 * and skips the Screen/BottomNav wrapper for those pages.
 *
 * Also adds the universal QuickAddMenu (floating + button) on all
 * authenticated pages.
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

const PUBLIC_PAGES = ["/login", "/register"];

// Pages where the floating + button should NOT appear.
//
// The FAB is shown on the Dashboard only — that's the screen where quick
// access to "what just happened" (sale / payment / expense / stock) is most
// useful. On every other screen (Khata, Sales, Payments, Expenses, Stock,
// More), the page header already has a "+" action in the top-right, so the
// FAB would be redundant and just add visual noise.
//
// Form/create/edit pages also hide the FAB (the user is already on a form).
const NO_FAB_PAGES = [
  "/khata",
  "/sales",
  "/payments",
  "/more",
  "/stock",
  "/sales/new",
  "/payments/new",
  "/more/expenses/new",
  "/more/customers/new",
  "/more/products/new",
  "/stock/add",
  "/stock/adjust",
  "/more/expenses/",
  "/more/products/",
];

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Don't show the FAB on form/create/edit pages
  const showFab = !isPublicPage && !NO_FAB_PAGES.some(
    (p) => pathname === p || (pathname.startsWith(p) && pathname.includes("/edit")),
  );

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
                  {showFab ? <QuickAddMenu /> : null}
                </Screen>
              </AuthGate>
            )}
          </ToastProvider>
        </QueryProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
