"use client";

/**
 * PullToRefresh — wraps a scrollable area and adds pull-to-refresh.
 *
 * Usage:
 *   <PullToRefresh onRefresh={async () => { await refetch(); }}>
 *     <div className="space-y-4">
 *       ...scrollable content...
 *     </div>
 *   </PullToRefresh>
 *
 * The component:
 *   - Renders a scroll container (overflow-y-auto) that fills available height.
 *   - Shows a refresh indicator at the top that appears as the user pulls down.
 *   - Triggers `onRefresh` when the pull exceeds 70px (or on Cmd+R / Ctrl+R).
 *   - Shows a spinner while `onRefresh` is running.
 *
 * Mobile UX:
 *   - User drags down from the top → indicator slides in from the top.
 *   - Arrow rotates 180° once the pull crosses the threshold.
 *   - On release: if past threshold, refetch runs and indicator stays
 *     visible with a spinner until the promise resolves.
 *
 * Desktop UX:
 *   - Mouse drag works the same way (rarely used, but supported).
 *   - Cmd+R / Ctrl+R triggers a refresh without a full page reload.
 */

import { type ReactNode } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { cn } from "@/lib/utils/cn";

export function PullToRefresh({
  children,
  onRefresh,
  className,
  // Height of the refresh indicator when fully extended (px).
  // The pull threshold is 70px, so this should be ~70 or less.
  indicatorHeight = 56,
}: {
  children: ReactNode;
  onRefresh: () => Promise<void> | void;
  className?: string;
  indicatorHeight?: number;
}) {
  const { containerRef, pullDistance, isRefreshing, isReadyToRelease } =
    usePullToRefresh({ onRefresh });

  // Show the indicator if: pulling, refreshing, or recently pulled.
  const showIndicator = pullDistance > 0 || isRefreshing;
  // The indicator height matches the pull distance (capped).
  const indicatorVisibleHeight = isRefreshing
    ? indicatorHeight // hold at full height while refreshing
    : Math.min(pullDistance, indicatorHeight);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-y-auto overscroll-y-contain", className)}
      style={{
        // Prevent the browser's native pull-to-refresh on Chrome Android
        // from interfering with our custom one.
        overscrollBehaviorY: "contain",
        // Disable text selection during pull (feels more native)
        touchAction: "pan-y",
      }}
    >
      {/* Refresh indicator — slides down from the top */}
      {showIndicator ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center"
          style={{ height: `${indicatorVisibleHeight}px` }}
          aria-hidden
        >
          <div className="flex h-8 w-8 items-center justify-center">
            {isRefreshing ? (
              <RefreshCw className="h-5 w-5 animate-spin text-brand-600" />
            ) : (
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-brand-600 transition-transform duration-150",
                  isReadyToRelease ? "rotate-180" : "",
                )}
                strokeWidth={2.5}
              />
            )}
          </div>
        </div>
      ) : null}

      {/* Content */}
      {children}
    </div>
  );
}
