/**
 * App header — sticky top bar with the current screen title.
 *
 * Phase 3 only shows the title. Later phases will add:
 *   - business name (from Setting)
 *   - search icon
 *   - settings icon
 */

import { cn } from "@/lib/utils/cn";

export function AppHeader({
  title,
  rightSlot,
  className,
}: {
  title: string;
  rightSlot?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4",
        className,
      )}
    >
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
    </header>
  );
}
