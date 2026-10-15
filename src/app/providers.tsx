"use client";

/**
 * Providers — wraps all client-side context providers.
 *
 * V9: Restores the Dashboard FAB as the primary hold-to-talk control.
 *
 * Architecture:
 *   - useSmartEntry + useAudioRecorder are BOTH lifted to providers.tsx
 *   - HoldToTalkFab uses the shared recorder + smartEntry
 *   - SmartEntryModal receives the shared recorder as a prop (no longer
 *     creates its own)
 *   - Single recording path, single state machine
 *
 * Data flow:
 *   HOLD the FAB → recorder.start() → recorder.stop() → smartEntry.submitAudio()
 *     → state = "transcribing" → modal opens → form
 *   SHORT TAP the FAB → modal opens → ChoiceView (text entry only)
 *   Text: smartEntry.submitText() → state = "interpreting" → form
 */

import { useState, useCallback } from "react";
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

  const showFab = !isPublicPage && pathname === DASHBOARD_PATH;

  // ── Shared Smart Entry state + recorder ──────────────────────────────────
  // Both are owned HERE so the FAB and modal share the same instances.
  const smartEntry = useSmartEntry();
  const recorder = useAudioRecorder();
  const [modalOpen, setModalOpen] = useState(false);

  const handleModalOpen = useCallback(() => {
    setModalOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setModalOpen(false);
    smartEntry.reset();
  }, [smartEntry]);

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
