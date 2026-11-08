"use client";

/**
 * BarList — ranked horizontal bars.
 *
 * Horizontal bars are the honest encoding for comparing categories: the eye
 * reads length accurately, every bar starts at zero, and the ranking is the
 * insight. The value is always printed next to the bar, so colour is never the
 * only carrier of the number.
 */

import type { ReactNode } from "react";

export type BarItem = {
  key: string;
  label: string;
  value: number;
  /** Pre-formatted value shown to the reader (may include the currency symbol). */
  display: ReactNode;
  /** Plain-text value for screen readers. */
  ariaValue?: string;
};

export function BarList({
  items,
  colorVar = "--accent-500",
}: {
  items: BarItem[];
  colorVar?: string;
}) {
  const max = Math.max(0, ...items.map((item) => Math.abs(item.value)));

  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const pct = max > 0 ? Math.max(2, (Math.abs(item.value) / max) * 100) : 0;
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm capitalize text-ink-muted">
                {item.label}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                {item.display}
              </span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"
              role="img"
              aria-label={`${item.label}: ${item.ariaValue ?? item.value}`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: `rgb(var(${colorVar}))`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}