"use client";

/**
 * SmartKhataMicButton — the prominent floating microphone button for
 * Smart Khata Entry.
 *
 * POSITIONED ON THE RIGHT side of the Dashboard, more prominent than the
 * "+" manual-add FAB on the left. This is the primary Smart Khata entry
 * point — user taps the mic → speaks → confirms → done.
 *
 * Visual treatment:
 *   - Larger than the "+" FAB (64px vs 48px)
 *   - Gradient background (brand → purple) to feel "premium"
 *   - Subtle pulse animation ring to draw the eye
 *   - "Sparkles" icon badge in the corner for distinctiveness
 *   - Larger shadow for elevation
 *
 * Behavior:
 *   - Tap → opens SmartEntryModal directly into voice-input mode
 *   - The modal handles all subsequent states (recording, transcribing,
 *     understanding, ready, clarification, ambiguous, success, error)
 *
 * Rendered via providers.tsx — only on /dashboard.
 */

import { useState, useEffect } from "react";
import { Mic, Sparkles } from "lucide-react";
import { SmartEntryModal } from "@/components/smart-entry/SmartEntryModal";

export function SmartKhataMicButton() {
  const [open, setOpen] = useState(false);

  // Close on Escape key (extra escape hatch alongside the modal's own)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Positioned on the RIGHT, larger + more prominent than the + FAB.
        // On desktop, aligns to the right edge of the centered 1024px app shell.
        className="group fixed bottom-[5.5rem] right-0 z-30 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 via-brand-700 to-purple-700 text-white shadow-xl shadow-brand-600/40 transition-transform hover:scale-110 active:scale-95"
        style={{
          right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))",
        }}
        aria-label="Smart Khata voice entry — tap and speak what happened"
      >
        {/* Subtle pulse animation ring (draws the eye without being annoying) */}
        <span
          className="absolute inset-0 rounded-full bg-brand-500/40"
          style={{
            animation: "smart-mic-pulse 2.4s ease-out infinite",
          }}
          aria-hidden
        />
        {/* Sparkles badge in the corner to signal "this is special / AI-powered" */}
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm ring-2 ring-white">
          <Sparkles className="h-3 w-3" />
        </span>
        {/* The microphone icon */}
        <Mic className="relative h-7 w-7" strokeWidth={2.25} />
        <style>{`
          @keyframes smart-mic-pulse {
            0%   { transform: scale(1);   opacity: 0.55; }
            70%  { transform: scale(1.6); opacity: 0;    }
            100% { transform: scale(1.6); opacity: 0;    }
          }
        `}</style>
      </button>

      <SmartEntryModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
