"use client";

/**
 * Providers — wraps all client-side context providers.
 *
 * V13: Adds Smart Entry (HoldToTalkFab + SmartEntryModal) on the Dashboard.
 * The FAB + modal share the same useSmartEntry + useAudioRecorder instances
 * (lifted to this level so they stay in sync).
 */

import { useState, useCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { QueryProvider } from "@/providers/query-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { LanguageProvider } from "@/providers/language-provider";
import { AuthGate } from "@/providers/auth-gate";
import { Screen } from "@/components/layout/Screen";
import { BottomNav } from "@/components/layout/BottomNav";
import { QuickAddMenu } from "@/components/layout/QuickAddMenu";
import { HoldToTalkFab } from "@/components/smart-entry/HoldToTalkFab";
import { SmartEntryModal } from "@/components/smart-entry/SmartEntryModal";
import { useSmartEntry } from "@/hooks/smart-entry/use-smart-entry";
import { useAudioRecorder } from "@/hooks/smart-entry/use-audio-recorder";

const PUBLIC_PAGES = ["/login", "/register"];
const DASHBOARD_PATH = "/dashboard";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // ── Shared Smart Entry state + recorder ──────────────────────────────────
  const smartEntry = useSmartEntry();
  const recorder = useAudioRecorder();
  const [modalOpen, setModalOpen] = useState(false);

  const handleModalOpen = useCallback(() => setModalOpen(true), []);
  const handleClose = useCallback(() => {
    setModalOpen(false);
    smartEntry.reset();
  }, [smartEntry]);

  // Show Smart Entry FAB only on Dashboard
  const showSmartEntry = !isPublicPage && pathname === DASHBOARD_PATH;

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
                  {showSmartEntry ? (
                    <>
                      <QuickAddMenu />
                      <HoldToTalkFab
                        recorder={recorder}
                        smartEntry={smartEntry}
                        onModalOpen={handleModalOpen}
                      />
                      <SmartEntryModal
                        open={modalOpen}
                        onClose={handleClose}
                        smartEntry={smartEntry}
                        recorder={recorder}
                      />
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
