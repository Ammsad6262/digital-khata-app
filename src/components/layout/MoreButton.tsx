"use client";

/**
 * MoreButton — the global "More" trigger that lives in the top-right corner
 * of every main page header.
 *
 * Renders as a small icon button (Menu icon). When clicked, opens the
 * MoreDrawer (slide-out panel).
 *
 * V13: aria-label and visible label use t("nav.more").
 */

import { useRef, useState, useCallback } from "react";
import { Menu } from "lucide-react";
import { MoreDrawer } from "./MoreDrawer";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

export function MoreButton({
  className,
  variant = "icon",
}: {
  className?: string;
  /**
   * Visual variant:
   *   - "icon" (default): square icon button — fits inside existing page
   *     headers that already have a primary action on the right.
   *   - "pill": rounded pill button with "More" label — for headers that
   *     don't have another primary action.
   */
  variant?: "icon" | "pill";
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  if (variant === "pill") {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={handleOpen}
          aria-label={t("nav.more")}
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:scale-[0.98]",
            className,
          )}
        >
          <Menu className="h-4 w-4" />
          <span className="hidden sm:inline">{t("nav.more")}</span>
        </button>
        <MoreDrawer open={open} onClose={handleClose} triggerRef={triggerRef} />
      </>
    );
  }

  // default: icon variant
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-label={t("nav.more")}
        className={cn(
          "rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/40",
          className,
        )}
      >
        <Menu className="h-5 w-5" />
      </button>
      <MoreDrawer open={open} onClose={handleClose} triggerRef={triggerRef} />
    </>
  );
}
