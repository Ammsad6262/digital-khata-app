"use client";

/**
 * Dashboard skeleton — shimmer loading state shown while data is fetching.
 *
 * Mimics the actual layout so there's no visual jump when data arrives.
 */

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Hero card skeleton */}
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />

      {/* 4 stat cards skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl bg-slate-200"
          />
        ))}
      </div>

      {/* Quick actions skeleton */}
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl bg-slate-200"
          />
        ))}
      </div>

      {/* Recent activity skeleton */}
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
