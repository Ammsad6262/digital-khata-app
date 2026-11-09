"use client";

/**
 * ChartFrame — the card shell shared by every chart in the app.
 *
 * Charts are UI, so the frame carries the title, the one-line takeaway, an
 * optional legend, and the same border/shadow language as the rest of the app.
 */

import type { ReactNode } from "react";

export function ChartFrame({
  title,
  hint,
  legend,
  children,
}: {
  title: string;
  hint?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface shadow-card">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs leading-snug text-ink-subtle">{hint}</p> : null}
      </div>
      <div className="p-4">{children}</div>
      {legend ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-[10px] text-ink-subtle">
          {legend}
        </div>
      ) : null}
    </section>
  );
}

/** A legend key. `hollow` is used for the "previous period" series. */
export function LegendDot({
  colorVar,
  label,
  hollow = false,
}: {
  colorVar: string;
  label: string;
  hollow?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        aria-hidden="true"
        style={
          hollow
            ? {
                border: `2px solid rgb(var(${colorVar}))`,
                backgroundColor: "rgb(var(--surface))",
              }
            : { backgroundColor: `rgb(var(${colorVar}))` }
        }
      />
      {label}
    </span>
  );
}