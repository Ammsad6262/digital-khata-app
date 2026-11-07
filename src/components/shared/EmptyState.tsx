"use client";

/**
 * Empty state component — friendly message + optional CTA.
 * Used by every list screen when there's nothing to show yet.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";
import { localizeMessage } from "@/lib/i18n/message";

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
  const { t, tParams } = useLanguage();
  // Titles and descriptions arrive as `t(...)` strings, API error messages,
  // or translation keys. Localise here so error text is translated on every
  // list/detail screen without each caller having to remember to do it.
  const shownTitle = localizeMessage(title, t, tParams);
  const shownDescription = description
    ? localizeMessage(description, t, tParams)
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/50 p-8 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-slate-900">{shownTitle}</h3>
      {shownDescription ? (
        <p className="mt-1 max-w-xs text-xs text-slate-500">{shownDescription}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
