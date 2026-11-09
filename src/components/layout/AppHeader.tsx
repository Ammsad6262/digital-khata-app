/**
 * App header — sticky top bar with the current screen title.
 *
 * Translucent surface with a backdrop blur so content scrolls underneath it
 * without the header feeling like a heavy slab. The global "More" menu is
 * rendered on EVERY page that uses this header, so the owner never has to go
 * back to the dashboard to reach suppliers, reminders, insights, growth or
 * transactions.
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
        "sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line/80 bg-surface/80 px-4 backdrop-blur-xl",
        className,
      )}
    >
      <h1 className="min-w-0 truncate text-[15px] font-bold tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <div className="flex shrink-0 items-center gap-1.5">
        {rightSlot}
        <MoreButton />
      </div>
    </header>
  );
}