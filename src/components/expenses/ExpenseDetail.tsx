"use client";

/**
 * ExpenseDetail — full view of a single expense.
 *
 * Shows:
 *   - Amount hero (red — money out) with status badge (Recorded / Voided)
 *   - Name + category + date + notes
 *   - Edit button → /more/expenses/[id]/edit
 *   - Void action (with two-step confirmation)
 */

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  AlertCircle,
  Receipt,
  Ban,
  Loader2,
  CheckCircle2,
  Pencil,
} from "lucide-react";
import { useExpense, useVoidExpense } from "@/hooks/use-expenses";
import { Money } from "@/components/shared/Money";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/utils/money";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  transport:   { label: "Transport",   icon: "🚚" },
  shop:        { label: "Shop",        icon: "🏪" },
  electricity: { label: "Electricity", icon: "💡" },
  packaging:   { label: "Packaging",   icon: "📦" },
  salary:      { label: "Salary",      icon: "👷" },
  rent:        { label: "Rent",         icon: "🏠" },
  other:       { label: "Other",        icon: "•" },
};

export function ExpenseDetail({ expenseId }: { expenseId: string }) {
  const { data: expense, isLoading, isError, error, refetch } = useExpense(expenseId);
  const voidExpense = useVoidExpense();
  const [confirmVoid, setConfirmVoid] = useState(false);

  if (isLoading) {
    return <ExpenseDetailSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load expense"
        description={error instanceof Error ? error.message : "Something went wrong."}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm">
            Retry
          </Button>
        }
      />
    );
  }

  if (!expense) {
    return (
      <EmptyState
        title="Expense not found"
        description="This expense may have been deleted."
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Link href="/more/expenses">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Expenses
            </Button>
          </Link>
        }
      />
    );
  }

  const isVoided = !!expense.voidedAt;
  const categoryInfo = CATEGORY_LABELS[expense.category] ?? CATEGORY_LABELS.other ?? {
    label: "Other", icon: "•",
  };

  return (
    <div className="space-y-4">
      {/* Amount hero */}
      <div
        className={cn(
          "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
          isVoided && "opacity-75",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  isVoided
                    ? "border-slate-200 bg-slate-100 text-slate-600"
                    : "border-red-200 bg-red-50 text-red-700",
                )}
              >
                {isVoided ? <Ban className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {isVoided ? "Voided" : "Recorded"}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {categoryInfo.icon} {categoryInfo.label}
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-red-600">
              -<Money value={expense.amount} />
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatDateTime(new Date(expense.date))}
            </p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50">
            <Receipt className="h-6 w-6 text-red-600" />
          </div>
        </div>
      </div>

      {/* Name + notes */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-medium text-slate-500">Expense name</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{expense.name}</p>

        {expense.notes ? (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-xs font-medium text-slate-500">Notes</p>
            <p className="mt-1 text-sm text-slate-900">{expense.notes}</p>
          </div>
        ) : null}
      </div>

      {/* Edit button (only if not voided) */}
      {!isVoided ? (
        <Link href={`/more/expenses/${expense.id}/edit`}>
          <Button variant="outline" size="lg" className="w-full">
            <Pencil className="h-4 w-4" />
            Edit Expense
          </Button>
        </Link>
      ) : null}

      {/* Void section */}
      {isVoided ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
          <p className="text-xs text-slate-500">
            This expense was voided{expense.voidedAt ? ` on ${formatDateTime(new Date(expense.voidedAt))}` : ""}.
            It does not affect the dashboard expense totals.
          </p>
        </div>
      ) : confirmVoid ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-3">
          <div>
            <p className="text-sm font-semibold text-red-900">Void this expense?</p>
            <p className="mt-1 text-xs text-red-700">
              The expense will be excluded from dashboard totals. This cannot be undone.
              Use void for: incorrectly entered amounts, duplicates, or expenses that
              were never actually paid.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setConfirmVoid(false)}
              disabled={voidExpense.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="flex-1"
              disabled={voidExpense.isPending}
              onClick={() => {
                voidExpense.mutate(expense.id, {
                  onSuccess: () => {
                    setConfirmVoid(false);
                    refetch();
                  },
                });
              }}
            >
              {voidExpense.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Voiding...
                </>
              ) : (
                <>
                  <Ban className="h-4 w-4" />
                  Confirm Void
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmVoid(true)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          Void this expense
        </button>
      )}
    </div>
  );
}

function ExpenseDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
      <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
    </div>
  );
}
