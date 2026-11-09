"use client";

/**
 * Stat card — small stat box for the dashboard's 2×2 grid.
 *
 * Each card shows a calm label, a large tabular value and a tinted icon chip.
 * Value accepts string OR ReactNode so callers can pass <Money /> for
 * currency-formatted values.
 */

import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type StatTone = "brand" | "green" | "blue" | "amber" | "red" | "slate";

const TONE_CLASSES: Record<StatTone, { chip: string; dot: string }> = {
  brand: { chip: "bg-brand-50 text-brand-700", dot: "bg-brand-500" },
  green: { chip: "bg-success-soft text-success-ink", dot: "bg-success" },
  blue: { chip: "bg-info-soft text-info-ink", dot: "bg-info" },
  amber: { chip: "bg-warning-soft text-warning-ink", dot: "bg-warning" },
  red: { chip: "bg-danger-soft text-danger-ink", dot: "bg-danger" },
  slate: { chip: "bg-surface-2 text-ink-muted", dot: "bg-ink-faint" },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
}) {
  const tones = TONE_CLASSES[tone];
  return (
    <div className="group relative overflow-hidden rounded-card border border-line bg-surface p-3.5 shadow-card transition-shadow duration-200 hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tones.dot)} />
          <p className="text-[11px] font-medium leading-tight text-ink-subtle">
            {label}
          </p>
        </div>
        {Icon ? (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.6rem]",
              tones.chip,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 truncate text-[17px] font-bold tracking-[-0.02em] tabular-nums text-ink">
        {value}
      </p>
    </div>
  );
}