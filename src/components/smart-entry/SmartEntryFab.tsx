"use client";

/**
 * SmartEntryFab — a simple floating action button that opens the Smart Entry
 * modal on tap/click.
 *
 * V2: Replaces the old HoldToRecordButton. The hold-to-record interaction was
 * confusing and unreliable on mobile (150ms threshold too short, pointer-event
 * complexity, accidental recordings, state-sync bugs between two recording
 * paths).
 *
 * Now: ONE tap → opens the Smart Entry modal → user chooses Voice or Text.
 * The recording happens INSIDE the modal using the modal's own useAudioRecorder,
 * so there's only ONE recording path and ONE state machine.
 *
 * Design:
 *   - 64px circular gradient button on the RIGHT side of the Dashboard
 *   - Pulse animation to draw attention
 *   - Sparkles badge to indicate AI feature
 *   - Accessible aria-label
 *   - Respects reduced-motion (pulse animation disabled via globals.css)
 */

import { Mic, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

export function SmartEntryFab({
  onClick,
}: {
  onClick: () => void;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fixed bottom-[5.5rem] z-30 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl transition-transform",
        "bg-gradient-to-br from-brand-600 via-brand-700 to-purple-700 shadow-brand-600/40 hover:scale-110 active:scale-95",
      )}
      style={{
        right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))",
      }}
      aria-label={t("smartentry.aria.fab")}
    >
      {/* Pulse ring */}
      <span
        className="absolute inset-0 rounded-full bg-brand-500/40"
        style={{ animation: "smart-mic-pulse 2.4s ease-out infinite" }}
        aria-hidden
      />

      {/* Sparkles badge */}
      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-2 ring-white">
        <Sparkles className="h-3 w-3" />
      </span>

      {/* Mic icon */}
      <Mic className="relative h-7 w-7" strokeWidth={2.25} />

      <style>{`
        @keyframes smart-mic-pulse {
          0% { transform: scale(1); opacity: 0.55; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </button>
  );
}
