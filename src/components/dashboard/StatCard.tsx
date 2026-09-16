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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        {Icon ? (
          <div className={cn("rounded-lg p-1.5", tones.iconBg)}>
            <Icon className={cn("h-3.5 w-3.5", tones.iconText)} />
          </div>
        ) : null}
      </div>
      <p className={cn("mt-1.5 text-lg font-bold tracking-tight tabular-nums", tones.value)}>
        {value}
      </p>
    </div>
  );
}
