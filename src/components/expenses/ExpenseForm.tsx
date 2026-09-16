"use client";

/**
 * ExpenseForm — shared between Add and Edit.
 *
 * Fields:
 *   - Name (required)
 *   - Amount (required, > 0)
 *   - Category (required — picker)
 *   - Date (defaults to today)
 *   - Notes (optional)
 *
 * In edit mode: pre-fills from the existing expense.
 *
 * On success:
 *   - Create: toast + redirect to /more/expenses/[id]
 *   - Edit: toast + redirect to /more/expenses/[id]
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextField } from "@/components/ui/TextField";
import { TextArea } from "@/components/ui/TextArea";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { useToast } from "@/providers/toast-provider";
import {
  useRecordExpense,
  useUpdateExpense,
  useExpense,
} from "@/hooks/use-expenses";
import { ApiError } from "@/lib/utils/api-client";
import { cn } from "@/lib/utils/cn";

const CATEGORIES: Array<{
  value: "transport" | "shop" | "electricity" | "packaging" | "salary" | "rent" | "other";
  label: string;
  icon: string;
}> = [
  { value: "transport",   label: "Transport",   icon: "🚚" },
  { value: "shop",        label: "Shop",         icon: "🏪" },
  { value: "electricity", label: "Electricity",  icon: "💡" },
  { value: "packaging",   label: "Packaging",    icon: "📦" },
  { value: "salary",      label: "Salary",       icon: "👷" },
  { value: "rent",        label: "Rent",         icon: "🏠" },
  { value: "other",       label: "Other",        icon: "•" },
];

type Category = typeof CATEGORIES[number]["value"];

function todayIsoLocal(): string {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

export function ExpenseForm({
  mode,
  expenseId,
}: {
  mode: "create" | "edit";
  expenseId?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  // In edit mode, fetch existing expense to pre-fill.
  const { data: existing } = useExpense(mode === "edit" ? expenseId : null);

  const recordExpense = useRecordExpense();
  const updateExpense = useUpdateExpense(expenseId ?? "");

  const [name, setName] = useState<string>(existing?.name ?? "");
  const [amount, setAmount] = useState<string>(
    existing?.amount ? existing.amount.toString() : "",
  );
  const [category, setCategory] = useState<Category>(existing?.category as Category ?? "other");
  const [date, setDate] = useState<string>(
    existing?.date ? new Date(existing.date).toISOString().slice(0, 10) : todayIsoLocal(),
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");

  // Wait for product data to load in edit mode.
  if (mode === "edit" && !existing) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  // Validation
  const errors: {
    name?: string;
    amount?: string;
    date?: string;
  } = {};

  if (!name.trim()) {
    errors.name = "Name is required.";
  }

  const amt = parseFloat(amount);
  if (!amount || isNaN(amt) || amt <= 0) {
    errors.amount = "Amount must be greater than 0.";
  }

  if (!date) {
    errors.date = "Date is required.";
  }

  const hasErrors = !!errors.name || !!errors.amount || !!errors.date;

  const handleSubmit = () => {
    if (hasErrors) {
      toast.error("Please fix the errors before saving.");
      return;
    }

    const isoDate = new Date(date).toISOString();
    const payload = {
      name: name.trim(),
      amount: amt,
      category,
      notes: notes.trim() || null,
      date: isoDate,
    };

    if (mode === "create") {
      recordExpense.mutate(payload, {
        onSuccess: (expense) => {
          toast.success(`Expense "${expense.name}" recorded`);
          router.push(`/more/expenses/${expense.id}`);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to record expense.");
        },
      });
    } else {
      updateExpense.mutate(payload, {
        onSuccess: (expense) => {
          toast.success(`Expense "${expense.name}" updated`);
          router.push(`/more/expenses/${expense.id}`);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === "NOT_FOUND") {
            toast.error("Expense not found.");
          } else {
            toast.error(error instanceof Error ? error.message : "Failed to update expense.");
          }
        },
      });
    }
  };

  const isPending = recordExpense.isPending || updateExpense.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {/* Name */}
          <TextField
            label="Expense name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Diesel for delivery van"
            autoComplete="off"
            error={errors.name ?? null}
          />

          {/* Amount */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Amount
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                Rs.
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                autoFocus={mode === "create"}
                className={cn(
                  "w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-lg font-bold tabular-nums text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2",
                  errors.amount
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30",
                )}
              />
            </div>
            {errors.amount ? (
              <p className="mt-1 text-xs text-red-600">{errors.amount}</p>
            ) : null}
          </div>

          {/* Category */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Category
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg border py-2 text-[11px] font-medium transition-colors",
                    category === cat.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className="text-base leading-none">{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayIsoLocal()}
              className={cn(
                "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2",
                errors.date
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                  : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30",
              )}
            />
          </div>

          {/* Notes */}
          <TextArea
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details about this expense..."
            rows={2}
          />
        </div>
      </div>

      {/* Sticky action bar */}
      <StickyFormActions
        onCancel={() => router.back()}
        onSave={handleSubmit}
        saveLabel={mode === "create" ? "Save Expense" : "Update Expense"}
        saveDisabled={hasErrors}
        isPending={isPending}
      />
    </div>
  );
}
