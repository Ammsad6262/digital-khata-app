"use client";

/**
 * PageHeader — the one sticky header used by every top-level section.
 *
 * Left:  icon tile + title + one-line subtitle.
 * Right: an optional primary action pill, then the global More button.
 *
 * Kept deliberately plain: no sparkles, no arrows, no gradients. The colour
 * comes from the theme tokens, so every tab shifts with the selected palette.
 */

import Link from "next/link";
import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { MoreButton } from "@/components/layout/MoreButton";
import { cn } from "@/lib/utils/cn";

type Tone = "brand" | "neutral";

const TONE: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand/10",
  neutral: "bg-surface-2 text-ink-muted ring-line",
};

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  tone = "brand",
  showMore = true,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  tone?: Tone;
  showMore?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/80 px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] ring-1 ring-inset",
              TONE[tone],
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-[11px] leading-tight text-ink-subtle">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          {showMore ? <MoreButton /> : null}
        </div>
      </div>
    </header>
  );
}

/**
 * HeaderAction — the primary "add" pill that sits on the right of a header.
 * Label collapses to a short form on narrow phones.
 */
export function HeaderAction({
  href,
  label,
  shortLabel,
  icon: Icon,
}: {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-brand transition-transform hover:scale-[1.02] active:scale-95"
    >
      <Icon className="h-4 w-4" strokeWidth={2.5} />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel ?? label}</span>
    </Link>
  );
}