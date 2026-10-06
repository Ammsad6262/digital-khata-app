"use client";

/**
 * SmartEntryButton — the prominent Dashboard button that opens SmartEntryModal.
 *
 * Renders as a full-width gradient card with a Sparkles icon — visually
 * distinct from the regular QuickActions below it.
 *
 * When tapped, mounts the SmartEntryModal (which is itself rendered via
 * Portal to document.body).
 */

import { useState } from "react";
import { Sparkles, Mic, Type } from "lucide-react";
import { SmartEntryModal } from "./SmartEntryModal";

export function SmartEntryButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-purple-700 p-4 text-left text-white shadow-lg shadow-brand-600/30 transition-transform active:scale-[0.99]"
        aria-label="Open Smart Khata Entry"
      >
        {/* Decorative sparkles */}
        <Sparkles className="absolute right-3 top-3 h-5 w-5 text-white/30" />
        <Sparkles className="absolute right-10 top-7 h-3 w-3 text-white/20" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-tight">Smart Entry</p>
            <p className="mt-0.5 text-xs text-white/80">Speak or type what happened</p>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[11px] font-medium backdrop-blur-sm">
            <Mic className="h-3 w-3" />
            <Type className="h-3 w-3" />
          </div>
        </div>
      </button>

      <SmartEntryModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
