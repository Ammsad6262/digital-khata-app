"use client";

/**
 * Empty state — friendly message + optional CTA.
 * Used by every list screen when there's nothing to show yet.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-card border border-line bg-surface shadow-card px-6 py-10 text-center shadow-card",
        className,
      )}
    >
      {/* soft brand wash behind the icon */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-brand-500/10 blur-2xl"
      />
      {icon ? (
        <div className="relative mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-brand-600 ring-1 ring-line">
          {icon}
        </div>
      ) : null}
      <h3 className="relative text-[15px] font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="relative mt-1.5 max-w-[17rem] text-[13px] leading-relaxed text-ink-subtle">
          {description}
        </p>
      ) : null}
      {action ? <div className="relative mt-5">{action}</div> : null}
    </div>
  );
}