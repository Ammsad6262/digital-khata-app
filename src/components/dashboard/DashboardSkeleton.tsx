"use client";

/**
 * Dashboard skeleton — shimmer loading state shown while data is fetching.
 *
 * IMPORTANT: The skeleton MUST match the real dashboard's layout dimensions
 * to prevent Cumulative Layout Shift (CLS). Every element in the skeleton
 * has the same height/width as its real counterpart so there's no visual
 * jump when data arrives.
 */

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Global search bar skeleton */}
      <div className="h-12 animate-pulse rounded-control border border-line bg-surface-2" />

      {/* Hero card skeleton */}
      <div className="h-32 animate-pulse rounded-[1.5rem] bg-surface-3" />

      {/* Quick actions skeleton */}
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[4.1rem] animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>

      {/* Section title skeleton */}
      <div className="flex items-center justify-between px-1">
        <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
      </div>

      {/* 4 stat cards skeleton */}
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[4.6rem] animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>

      {/* P&L skeleton */}
      <div className="h-28 animate-pulse rounded-card bg-surface-2" />

      {/* Recent activity skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <div className="h-9 w-9 animate-pulse rounded-[0.7rem] bg-surface-2" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
                <div className="h-2.5 w-32 animate-pulse rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}