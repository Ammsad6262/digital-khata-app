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

import { Search, X, Users, AlertCircle, UserPlus, UserPlus2, Plus, Sparkles, Lightbulb, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCustomerSearch } from "@/hooks/use-customers";
import { CustomerRow } from "@/components/khata/CustomerRow";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/providers/language-provider";

export function KhataList() {
  const { query, setQuery, data, isLoading, isError, error, refetch } =
    useCustomerSearch();
  const { t } = useLanguage();

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
            placeholder={t("customer.searchPlaceholder")}
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
            {t("customer.keepTyping")}
          </p>
        ) : null}
      </div>

      {/* Body — loading / error / empty / list */}
      {isLoading ? (
        <KhataListSkeleton />
      ) : isError ? (
        <EmptyState
          title={t("customer.couldntLoad")}
          description={
            error instanceof Error
              ? error.message
              : t("common.networkError")
          }
          icon={<AlertCircle className="h-6 w-6" />}
          action={
            <Button onClick={() => refetch()} variant="outline" size="sm">
              {t("common.retry")}
            </Button>
          }
        />
      ) : isEmpty ? (
        query.trim() ? (
          <EmptyState
            title={t("customer.noMatch")}
            description={`${t("customer.noMatchDesc")} "${query.trim()}".`}
            icon={<Search className="h-6 w-6" />}
            action={
              <Link href="/more/customers/new">
                <Button size="sm" variant="outline">
                  <UserPlus className="h-4 w-4" />
                  {t("customer.addFirstBtn")}
                </Button>
              </Link>
            }
          />
        ) : (
          <EmptyCustomersState />
        )
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-500">
              {query.trim() ? (
                <>
                  {data?.length} {data?.length === 1 ? t("customer.result") : t("customer.results")} {t("customer.for")} &ldquo;{query.trim()}&rdquo;
                </>
              ) : (
                <>
                  {data?.length} {data?.length === 1 ? t("customer.customer") : t("customer.customers")} {t("customer.total")}
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

/**
 * Empty customers state — matches the design spec.
 *
 * Layout (vertical, centered):
 *   1. Large light-green circle with a UserPlus icon (white) + small dark-green
 *      "+" badge at bottom-right + sparkle accents
 *   2. "No customers yet" heading
 *   3. Description: "Add your first customer to start tracking their khata."
 *   4. Large green pill button: "+ Add your first customer"
 *   5. Helper tip at the bottom: "💡 You can also create a customer from any transaction."
 */
function EmptyCustomersState() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      {/* Icon with badge + sparkles */}
      <div className="relative mb-5">
        {/* Sparkle accents */}
        <Sparkles className="absolute -left-3 -top-2 h-4 w-4 text-brand-300" aria-hidden />
        <Sparkles className="absolute -right-2 top-2 h-3 w-3 text-brand-200" aria-hidden />

        {/* Main icon container */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <UserPlus2 className="h-9 w-9 text-brand-600" strokeWidth={1.75} />
        </div>

        {/* Small "+" badge at bottom-right of the icon */}
        <div className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-sm">
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
        </div>
      </div>

      {/* Heading + description */}
      <h3 className="text-base font-semibold text-slate-900">
        {t("customer.noCustomers")}
      </h3>
      <p className="mt-1.5 max-w-xs text-sm text-slate-500">
        {t("customer.addFirst")}
      </p>

      {/* Primary CTA — large green pill */}
      <Link
        href="/more/customers/new"
        className="mt-6 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/30 transition-transform hover:scale-[1.02] active:scale-95"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        {t("customer.addFirstBtn")}
      </Link>

      {/* Helper tip */}
      <Link
        href="/sales/new"
        className="mt-8 flex w-full max-w-xs items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-left text-xs text-slate-500 transition-colors hover:bg-slate-100"
      >
        <Lightbulb className="h-4 w-4 shrink-0 text-brand-500" />
        <span className="flex-1">
          You can also create a customer from any transaction.
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </Link>
    </div>
  );
}