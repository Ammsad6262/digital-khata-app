"use client";

/**
 * KhataList — client component powering the customer/khata page.
 *
 * Features:
 *   - Debounced search (250ms) by name OR phone
 *   - Empty query → lists all customers (with balance)
 *   - Short query (< 2 chars) → shows hint to keep typing
 *   - Search results include balance badges
 *   - Loading skeleton while fetching
 *   - Error state with retry
 *   - Empty state with "Add customer" CTA
 */

import { Search, X, Users, AlertCircle, UserPlus, Plus } from "lucide-react";
import Link from "next/link";
import { useCustomerSearch } from "@/hooks/use-customers";
import { CustomerRow } from "@/components/khata/CustomerRow";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

export function KhataList() {
  const { query, setQuery, debouncedQuery, data, isLoading, isError, error, refetch } =
    useCustomerSearch();

  const isShortQuery = query.trim().length > 0 && query.trim().length < 2;
  const isEmpty = !data || data.length === 0;

  return (
    <div className="space-y-3">
      {/* Search bar — sticky within the scroll container */}
      <div className="sticky top-0 z-10 -mx-4 bg-slate-50 px-4 py-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            aria-label="Search customers"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {isShortQuery ? (
          <p className="mt-1 pl-1 text-xs text-slate-500">
            Keep typing — search needs at least 2 characters.
          </p>
        ) : null}
      </div>

      {/* Body — loading / error / empty / list */}
      {isLoading ? (
        <KhataListSkeleton />
      ) : isError ? (
        <EmptyState
          title="Couldn't load customers"
          description={
            error instanceof Error
              ? error.message
              : "Something went wrong."
          }
          icon={<AlertCircle className="h-6 w-6" />}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Retry
            </Button>
          }
        />
      ) : isEmpty ? (
        query.trim() ? (
          <EmptyState
            title="No customers match"
            description={`No customers found for "${query.trim()}". Try a different name or phone number.`}
            icon={<Search className="h-6 w-6" />}
            action={
              <Link href="/more/customers/new">
                <Button size="sm" variant="outline">
                  <UserPlus className="h-4 w-4" />
                  Add &ldquo;{query.trim()}&rdquo; as new customer
                </Button>
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No customers yet"
            description="Add your first customer to start tracking their khata. You can record sales and payments against them later."
            icon={<Users className="h-6 w-6" />}
            action={
              <Link href="/more/customers/new">
                <Button size="sm">
                  <UserPlus className="h-4 w-4" />
                  Add your first customer
                </Button>
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-500">
              {query.trim() ? (
                <>
                  {data?.length} {data?.length === 1 ? "result" : "results"} for &ldquo;{query.trim()}&rdquo;
                </>
              ) : (
                <>
                  {data?.length} {data?.length === 1 ? "customer" : "customers"} total
                </>
              )}
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {data?.map((customer, idx) => (
              <div
                key={customer.id}
                className={idx > 0 ? "border-t border-slate-100" : ""}
              >
                <CustomerRow customer={customer} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Floating add button (only when there are existing customers) */}
      {!isEmpty && !isError ? (
        <Link
          href="/more/customers/new"
          className="fixed bottom-20 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-transform hover:scale-105 active:scale-95"
          style={{ right: "max(1rem, calc((100vw - 480px) / 2 + 1rem))" }}
          aria-label="Add customer"
        >
          <Plus className="h-5 w-5" />
        </Link>
      ) : null}
    </div>
  );
}

function KhataListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-3 ${i > 0 ? "border-t border-slate-100" : ""}`}
          >
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
