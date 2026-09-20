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
      {/* Global search bar skeleton — matches the real search bar height (py-3 = h-12) */}
      <div className="h-12 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />

      {/* Hero card skeleton — matches the real HeroCard (p-5 + content = h-28) */}
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />

      {/* Quick actions skeleton — matches QuickActions grid (h-14 per button) */}
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl bg-slate-200"
          />
        ))}
      </div>

      {/* Section title skeleton */}
      <div className="flex items-center justify-between px-1">
        <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
      </div>

      {/* 4 stat cards skeleton — matches StatCard (p-3 + content = h-20) */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl bg-slate-200"
          />
        ))}
      </div>

      {/* Recent activity skeleton — matches section title + list */}
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? "border-t border-slate-100" : ""}`}
            >
              <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                <div className="h-2.5 w-32 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
