"use client";

/**
 * GlobalSearch — universal search bar for the dashboard.
 *
 * Searches BOTH customers (by name/phone) AND products (by name/SKU)
 * simultaneously, showing a unified results dropdown.
 *
 * Behavior:
 *   - Debounced 200ms
 *   - Min 2 chars to trigger search
 *   - Shows up to 4 customers + 4 products
 *   - Tapping a customer → /khata/[id]
 *   - Tapping a product → /more/products/[id]
 *   - "No match" state links to add new customer/product
 *   - Closes dropdown on tap-outside or selection
 *   - Keyboard: Escape closes, Enter selects first result
 */

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Search, X, Package, ChevronRight, UserPlus, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { apiGet } from "@/lib/utils/api-client";
import { Decimal } from "@/lib/utils/decimal";
import { formatMoney, formatQuantity } from "@/lib/utils/money";
import { useLanguage } from "@/providers/language-provider";

type CustomerHit = {
  id: string;
  name: string;
  phone: string;
  balance: string;
};

type ProductHit = {
  id: string;
  name: string;
  sku: string | null;
  sellingPrice: string;
  currentStock: string;
  unit: string;
};

type SearchResult = {
  customers: CustomerHit[];
  products: ProductHit[];
};

export function GlobalSearch() {
  const router = useRouter();
  const { t, tParams } = useLanguage();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 200);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on tap-outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search when debounced query changes
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setIsOpen(true);

    Promise.all([
      apiGet<{ id: string; name: string; phone: string; balance: string }[]>(
        `/api/customers?q=${encodeURIComponent(q)}`,
      ).catch(() => []),
      apiGet<ProductHit[]>(
        `/api/products?q=${encodeURIComponent(q)}`,
      ).catch(() => []),
    ])
      .then(([customers, products]) => {
        setResults({
          customers: customers.slice(0, 4),
          products: products.slice(0, 4),
        });
      })
      .finally(() => setIsLoading(false));
  }, [debouncedQuery]);

  const hasResults = results && (results.customers.length > 0 || results.products.length > 0);
  const q = query.trim();

  const handleNavigate = (href: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsOpen(false);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Enter" && results && results.customers[0]) {
              handleNavigate(`/khata/${results.customers[0]!.id}`);
            }
          }}
          placeholder={t("dashboard.searchPlaceholder")}
          className="w-full rounded-control border border-line-strong bg-surface py-3 pl-10 pr-10 text-[13px] text-ink shadow-soft placeholder:text-ink-faint transition-shadow focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          aria-label={t("common.globalSearchAria")}
          aria-expanded={isOpen}
          aria-controls="global-search-results"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults(null);
              setIsOpen(false);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={t("common.clearSearchAria")}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Results dropdown */}
      {isOpen && q.length >= 2 ? (
        <div
          id="global-search-results"
          className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-card border border-line bg-surface shadow-card shadow-lift animate-pop-in"
        >
          {isLoading ? (
            <p className="px-3 py-4 text-center text-xs text-ink-faint">
              {t("common.searching")}
            </p>
          ) : !hasResults ? (
            <div className="p-3">
              <p className="mb-2 text-xs text-ink-subtle">
                {tParams("search.noMatches", { query: q })}
              </p>
              <div className="flex gap-2">
                <Link
                  href={`/more/customers/new`}
                  onClick={() => setIsOpen(false)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-control bg-brand-50 px-2 py-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {t("action.addCustomer")}
                </Link>
                <Link
                  href={`/more/products/new`}
                  onClick={() => setIsOpen(false)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-control bg-info-soft px-2 py-2 text-xs font-semibold text-info-ink transition-colors hover:brightness-95"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  {t("stock.addProduct")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto scroll-slim">
              {/* Customers section */}
              {results!.customers.length > 0 ? (
                <div>
                  <p className="border-b border-line bg-surface-2 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    {t("dashboard.customers")} ({results!.customers.length})
                  </p>
                  {results!.customers.map((c) => {
                    const balance = new Decimal(c.balance);
                    const owes = balance.gt(0);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleNavigate(`/khata/${c.id}`)}
                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-brand-50 text-[11px] font-bold text-brand-700">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {c.name}
                          </p>
                          <p className="truncate text-[10px] text-ink-subtle">
                            {c.phone}
                          </p>
                        </div>
                        {owes ? (
                          <span className="shrink-0 text-[11px] font-bold tabular-nums text-danger-ink">
                            {formatMoney(balance)}
                          </span>
                        ) : null}
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint rtl-flip" />
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* Products section */}
              {results!.products.length > 0 ? (
                <div className={results!.customers.length > 0 ? "border-t border-line" : ""}>
                  <p className="border-b border-line bg-surface-2 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    {t("more.products")} ({results!.products.length})
                  </p>
                  {results!.products.map((p) => {
                    const stock = new Decimal(p.currentStock);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleNavigate(`/more/products/${p.id}`)}
                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-surface-2">
                          <Package className="h-4 w-4 text-ink-subtle" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-ink">
                            {p.name}
                          </p>
                          <p className="truncate text-[10px] text-ink-subtle">
                            {formatQuantity(stock, p.unit)} · {formatMoney(p.sellingPrice)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint rtl-flip" />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}