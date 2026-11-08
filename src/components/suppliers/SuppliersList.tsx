"use client";

/**
 * SuppliersList — searchable list of suppliers with what we owe each one.
 */

import Link from "next/link";
import { Search, Truck } from "lucide-react";
import { useSupplierSearch } from "@/hooks/use-suppliers";
import { useLanguage } from "@/providers/language-provider";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";

export function SuppliersList() {
  const { t } = useLanguage();
  const symbol = useCurrencySymbol();
  const { query, setQuery, data, isLoading, isError, error } = useSupplierSearch();

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("supplier.searchPlaceholder")}
          className="w-full rounded-lg border border-line-strong bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          aria-label={t("supplier.searchPlaceholder")}
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-ink-subtle">{t("common.loading")}</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-danger-ink">
          {error instanceof Error ? error.message : t("common.couldntLoad")}
        </p>
      ) : !data || data.length === 0 ? (
        query.trim() !== "" ? (
          <EmptyState
            title={t("supplier.noSearchResults")}
            icon={<Search className="h-6 w-6" />}
          />
        ) : (
          <EmptyState
            title={t("supplier.noSuppliers")}
            description={t("supplier.noSuppliersHint")}
            icon={<Truck className="h-6 w-6" />}
            action={
              <Link href="/more/suppliers/new">
                <Button size="sm">{t("supplier.addSupplier")}</Button>
              </Link>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {data.map((supplier) => {
            const balance = Number(supplier.balance);
            return (
              <li key={supplier.id}>
                <Link
                  href={`/more/suppliers/${supplier.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-app"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-subtle">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {supplier.name}
                    </p>
                    {supplier.phone ? (
                      <p className="truncate text-xs text-ink-subtle">{supplier.phone}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={
                        balance > 0
                          ? "text-sm font-semibold text-warning-ink"
                          : balance < 0
                            ? "text-sm font-semibold text-success-ink"
                            : "text-sm font-medium text-ink-subtle"
                      }
                    >
                      <Money value={Math.abs(balance)} symbol={symbol} />
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {balance > 0
                        ? t("supplier.payable")
                        : balance < 0
                          ? t("supplier.advancePaid")
                          : t("supplier.settled")}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
