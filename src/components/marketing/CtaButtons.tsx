import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The two headline calls to action the owner asked for.
 *
 *   1. "Use in browser"    → a real link to /register (the working path today).
 *   2. "Download the app"  → a DISABLED control, not a link. The Android app is
 *      not built yet, so it carries no href and no handler: it renders as a
 *      disabled <button> with a visible "Coming soon" badge, so it reads as
 *      intentionally upcoming rather than broken.
 */

export function UseInBrowserCta({ className }: { className?: string }) {
  return (
    <Link
      href="/register"
      className={cn(
        "focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-control bg-brand-600 px-6",
        "text-[15px] font-semibold tracking-[-0.01em] text-white shadow-brand transition-colors hover:bg-brand-700 active:bg-brand-800",
        className,
      )}
    >
      Use in browser
    </Link>
  );
}

export function DownloadAppCta({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className={cn(
            "inline-flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-control",
            "border border-dashed border-line-strong bg-surface px-6 text-[15px] font-semibold tracking-[-0.01em] text-ink-subtle",
          )}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download the app
        </button>
        <span className="pill border border-line bg-surface-2 text-ink-muted">Coming soon</span>
      </div>
      <p className="text-xs leading-relaxed text-ink-subtle">
        The Android app is on the way. The browser version works today.
      </p>
    </div>
  );
}
