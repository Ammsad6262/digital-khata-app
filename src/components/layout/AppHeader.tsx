/**
 * App header — sticky top bar with the current screen title.
 *
 * The global "More" menu is rendered here on EVERY page that uses this
 * header, so the owner never has to go back to the dashboard to reach
 * suppliers, reminders, insights, growth or transactions.
 */

import { MoreButton } from "./MoreButton";
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
      <h1 className="min-w-0 truncate text-base font-semibold text-slate-900">{title}</h1>
      <div className="flex shrink-0 items-center gap-1.5">
        {rightSlot}
        <MoreButton />
      </div>
    </header>
  );
}
