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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("supplier.searchPlaceholder")}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          aria-label={t("supplier.searchPlaceholder")}
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-600">
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
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {data.map((supplier) => {
            const balance = Number(supplier.balance);
            return (
              <li key={supplier.id}>
                <Link
                  href={`/more/suppliers/${supplier.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {supplier.name}
                    </p>
                    {supplier.phone ? (
                      <p className="truncate text-xs text-slate-500">{supplier.phone}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={
                        balance > 0
                          ? "text-sm font-semibold text-amber-700"
                          : balance < 0
                            ? "text-sm font-semibold text-emerald-700"
                            : "text-sm font-medium text-slate-500"
                      }
                    >
                      <Money value={Math.abs(balance)} symbol={symbol} />
                    </p>
                    <p className="text-[11px] text-slate-400">
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
