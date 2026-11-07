"use client";

/**
 * Stat card — small stat box for the 2×2 grid.
 *
 * Each card shows: label, value (big), and an optional icon + tint.
 * Value accepts string OR ReactNode so callers can pass <Money /> for
 * currency-formatted values.
 */

import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type StatTone = "green" | "blue" | "amber" | "red" | "slate";

const TONE_CLASSES: Record<StatTone, { iconBg: string; iconText: string; value: string }> = {
  green: { iconBg: "bg-brand-100", iconText: "text-brand-700", value: "text-slate-900" },
  blue:  { iconBg: "bg-blue-100",  iconText: "text-blue-700",  value: "text-slate-900" },
  amber: { iconBg: "bg-amber-100", iconText: "text-amber-700", value: "text-slate-900" },
  red:   { iconBg: "bg-red-100",   iconText: "text-red-700",   value: "text-red-700" },
  slate: { iconBg: "bg-slate-100", iconText: "text-slate-700", value: "text-slate-900" },
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
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold leading-snug text-slate-600">
          {label}
        </p>
        {Icon ? (
          <div className={cn("shrink-0 rounded-lg p-2", tones.iconBg)}>
            <Icon className={cn("h-4 w-4", tones.iconText)} />
          </div>
        ) : null}
      </div>
      <p className={cn("mt-2 text-lg font-bold tracking-tight tabular-nums sm:text-xl", tones.value)}>
        {value}
      </p>
    </div>
  );
}
