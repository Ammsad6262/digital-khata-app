"use client";

/**
 * CustomerPicker — search-driven customer selector for the New Sale form.
 *
 * Behavior:
 *   - When no customer is selected: shows a search input + results list.
 *   - When a customer is selected: shows the selected customer card with
 *     a "Change" button.
 *   - When search returns no matches: shows an INLINE QUICK-ADD form
 *     (name pre-filled + phone field) so the user can create a customer
 *     without leaving the sale. This avoids losing line items.
 *
 * The selected customer's current balance is shown so the owner can see
 * if they already owe money before recording a new sale.
 */

import { Search, Phone, ChevronRight, UserPlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { useCustomerSearch, useCreateCustomer } from "@/hooks/use-customers";
import { Money } from "@/components/shared/Money";
import { Decimal } from "@/lib/utils/decimal";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";
import type { CustomerSearchResult } from "@/lib/services/customers";
import { useLanguage } from "@/providers/language-provider";

export type SelectedCustomer = CustomerSearchResult;

export function CustomerPicker({
  selected,
  onSelect,
  error,
}: {
  selected: SelectedCustomer | null;
  onSelect: (customer: SelectedCustomer | null) => void;
  error?: string | null;
}) {
  const { query, setQuery, data, isLoading, isError } = useCustomerSearch();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { t } = useLanguage();

  // Already selected → show the selected card.
  if (selected) {
    const balance = new Decimal(selected.balance);
    const owes = balance.gt(0);

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {selected.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {selected.name}
            </p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Phone className="h-3 w-3" />
              {selected.phone || t("customer.noMatch")}
            </p>
            {owes ? (
              <p className="mt-1 text-xs">
                <span className="text-slate-500">{t("customer.currentBalance")}: </span>
                <span className="font-semibold text-red-600">
                  <Money value={balance.toString()} /> {t("customer.owes")}
                </span>
              </p>
            ) : balance.lt(0) ? (
              <p className="mt-1 text-xs">
                <span className="text-slate-500">{t("customer.advancePayment")}: </span>
                <span className="font-semibold text-blue-600">
                  <Money value={balance.abs().toString()} />
                </span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">{t("customer.noBalance")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setQuery("");
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50"
          >
            {t("common.change")}
          </button>
        </div>
      </div>
    );
  }

  // Inline quick-add form
  if (showQuickAdd) {
    return (
      <QuickAddCustomer
        initialName={query.trim()}
        onCancel={() => setShowQuickAdd(false)}
        onCreated={(customer) => {
          setShowQuickAdd(false);
          setQuery("");
          onSelect(customer);
        }}
      />
    );
  }

  // Not selected → show search.
  return (
    <div className="space-y-2">
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
          placeholder={t("sale.searchCustomer")}
          className={`w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
            error
              ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
              : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30"
          }`}
          aria-label={t("common.searchCustomerAria")}
          aria-invalid={!!error}
          autoFocus
        />
      </div>

      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : null}

      {/* Results */}
      <div className="space-y-1">
        {isLoading ? (
          <p className="px-2 py-3 text-xs text-slate-400">{t("common.loading")}</p>
        ) : isError ? (
          <p className="px-2 py-3 text-xs text-red-600">{t("customer.couldntLoad")}</p>
        ) : !data || data.length === 0 ? (
          query.trim() ? (
            <button
              type="button"
              onClick={() => setShowQuickAdd(true)}
              className="flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-brand-300 bg-brand-50/50 px-3 py-3 text-left hover:bg-brand-50 active:bg-brand-100"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
                <UserPlus className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-brand-700">
                  {t("action.addCustomer")} &ldquo;{query.trim()}&rdquo; {t("customer.asNew")}
                </p>
                <p className="text-[11px] text-slate-500">
                  {t("common.tapToCreate")}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-brand-400" />
            </button>
          ) : (
            <p className="px-2 py-3 text-xs text-slate-400">
              {t("sale.startTypingCustomer")}
            </p>
          )
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {data.slice(0, 5).map((customer, idx) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => onSelect(customer)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 ${
                  idx > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {customer.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">{customer.phone}</p>
                </div>
                {new Decimal(customer.balance).gt(0) ? (
                  <span className="shrink-0 text-xs font-semibold text-red-600">
                    <Money value={customer.balance} />
                  </span>
                ) : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            ))}
            {data.length > 5 ? (
              <p className="border-t border-slate-100 px-3 py-1.5 text-center text-[11px] text-slate-400">
                {data.length} {t("common.refineSearch")}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Inline Quick Add Customer — mini form that creates a customer on the fly
// without navigating away (preserves the sale's line items)
// ────────────────────────────────────────────────────────────────────────────

function QuickAddCustomer({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string;
  onCancel: () => void;
  onCreated: (customer: CustomerSearchResult) => void;
}) {
  const toast = useToast();
  const createCustomer = useCreateCustomer();
  const { t } = useLanguage();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState("");

  const canSave = name.trim().length > 0 && phone.trim().length >= 7 && !createCustomer.isPending;

  const handleCreate = () => {
    if (!canSave) return;
    createCustomer.mutate(
      {
        name: name.trim(),
        phone: phone.trim(),
        openingBalance: 0,
      },
      {
        onSuccess: (customer) => {
          toast.success(t("customer.customerAdded"));
          onCreated({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            balance: "0",
          });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === "CONFLICT") {
            toast.error(t("customer.phoneAlreadyExists"));
          } else {
            toast.error(error instanceof Error ? error.message : t("common.failed"));
          }
        },
      },
    );
  };

  return (
    <div className="rounded-xl border-2 border-brand-300 bg-white p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-brand-700">
        <UserPlus className="h-4 w-4" />
        {t("action.addCustomer")}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">{t("customer.name")}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          {t("customer.phone")} <span className="text-red-600">*</span>
        </label>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("customer.phonePlaceholder")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!canSave}
          className="flex-[2] flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:bg-brand-300"
        >
          {createCustomer.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("common.saving")}
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" />
              {t("common.save")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
