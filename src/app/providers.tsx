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
 * CRITICAL: The Smart Entry modal + HoldToRecordButton share a SINGLE
 * useSmartEntry hook instance (owned here in Providers). This prevents the
 * bug where HoldToRecordButton processed audio in its own hook, but the
 * modal's separate hook was still "idle" → showed the Text/Voice selection
 * screen instead of the transaction review form.
 *
 * Data flow:
 *   HoldToRecordButton.onAudioReady(blob)
 *     → smartEntry.submitAudio(blob)
 *     → smartEntry.state = "transcribing" → "form"
 *     → SmartEntryModal renders the editable form (state="form")
 *
 *   SmartEntryModal text submit
 *     → smartEntry.submitText(text)
 *     → smartEntry.state = "interpreting" → "form"
 *     → SmartEntryModal renders the editable form (state="form")
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
import { HoldToRecordButton } from "@/components/smart-entry/HoldToRecordButton";
import { SmartEntryModal } from "@/components/smart-entry/SmartEntryModal";
import { useSmartEntry } from "@/hooks/smart-entry/use-smart-entry";

const PUBLIC_PAGES = ["/login", "/register"];
const DASHBOARD_PATH = "/dashboard";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  const showFab = !isPublicPage && pathname === DASHBOARD_PATH;

  // ── Shared Smart Entry state ──────────────────────────────────────────────
  // This is the SINGLE useSmartEntry instance shared between HoldToRecordButton
  // and SmartEntryModal. Both components read + write to the same state.
  const smartEntry = useSmartEntry();
  const [modalOpen, setModalOpen] = useState(false);

  // Callback for HoldToRecordButton → passes audio blob to the shared hook
  const handleAudioReady = useCallback((blob: Blob, mimeType: string) => {
    setModalOpen(true);
    smartEntry.submitAudio(blob, mimeType);
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
                      <HoldToRecordButton
                        modalOpen={modalOpen}
                        setModalOpen={setModalOpen}
                        onAudioReady={handleAudioReady}
                        smartEntryState={smartEntry.state}
                      />
                      <SmartEntryModal
                        open={modalOpen}
                        onClose={() => {
                          setModalOpen(false);
                          smartEntry.reset();
                        }}
                        smartEntry={smartEntry}
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
