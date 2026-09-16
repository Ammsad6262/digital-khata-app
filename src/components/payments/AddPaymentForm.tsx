"use client";

/**
 * AddPaymentForm — fast payment entry.
 *
 * Fields:
 *   - Customer (search by name/phone)
 *   - Amount (must be > 0)
 *   - Payment method (Cash / Bank / Cheque / JazzCash / EasyPaisa / Other)
 *   - Date (defaults to today)
 *   - Notes (optional)
 *
 * Overpayment handling (matches the service-layer policy):
 *   - If the customer has zero balance, show a note: "Customer has no
 *     outstanding balance. This payment will create an advance credit."
 *   - If the entered amount exceeds the customer's outstanding balance,
 *     show a note: "This will create an advance payment of Rs. X on the
 *     customer's account."
 *   - These are SOFT warnings (informational) — the owner can still save.
 *
 * Validation (blocking):
 *   - Customer required
 *   - Amount > 0 and finite
 *   - Date must be present
 *
 * On success: toast + redirect to the new payment's detail page.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertCircle, Wallet } from "lucide-react";
import { CustomerPicker, type SelectedCustomer } from "@/components/sales/CustomerPicker";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { Money } from "@/components/shared/Money";
import { useRecordPayment } from "@/hooks/use-payments";
import { useCustomerBalance } from "@/hooks/use-customer-balance";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";
import { Decimal } from "@/lib/utils/decimal";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

type Method = "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other";

const METHODS: Array<{ value: Method; label: string; icon: string }> = [
  { value: "cash",      label: "Cash",      icon: "💵" },
  { value: "bank",      label: "Bank",      icon: "🏦" },
  { value: "cheque",    label: "Cheque",    icon: "📝" },
  { value: "jazzcash",  label: "JazzCash",  icon: "📱" },
  { value: "easypaisa", label: "EasyPaisa", icon: "📱" },
  { value: "other",     label: "Other",     icon: "•" },
];

function todayIsoLocal(): string {
  // Returns YYYY-MM-DD for an <input type="date">.
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

export function AddPaymentForm() {
  const router = useRouter();
  const toast = useToast();
  const recordPayment = useRecordPayment();

  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<Method>("cash");
  const [date, setDate] = useState<string>(todayIsoLocal());
  const [notes, setNotes] = useState<string>("");
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Fetch the customer's current balance whenever a customer is selected,
  // so we can show overpayment warnings.
  const balanceQuery = useCustomerBalance(customer?.id ?? null);

  // ── Compute warnings (soft, non-blocking) ──────────────────────────────
  const warning = useMemo(() => {
    if (!customer || !balanceQuery.data) return null;
    const currentBalance = new Decimal(balanceQuery.data.balance);
    const enteredAmount = parseDecimalSafe(amount);

    if (enteredAmount.lte(0)) return null;

    if (currentBalance.lte(0)) {
      // Customer has no outstanding balance (already settled or in advance).
      return {
        type: "info" as const,
        message: `Customer has no outstanding balance (current: ${formatMoney(currentBalance)}). This payment will be recorded as an advance credit.`,
      };
    }

    if (enteredAmount.gt(currentBalance)) {
      // Overpayment.
      const overpay = enteredAmount.minus(currentBalance);
      return {
        type: "warning" as const,
        message: `Customer owes ${formatMoney(currentBalance)}. This payment of ${formatMoney(enteredAmount)} will create an advance credit of ${formatMoney(overpay)} on their account.`,
      };
    }

    return null;
  }, [customer, balanceQuery.data, amount]);

  // ── Validation ───────────────────────────────────────────────────────
  const validation = useMemo(() => {
    const errors: { customer?: string; amount?: string; date?: string } = {};

    if (!customer) {
      errors.customer = "Please select a customer.";
    }

    const amt = parseDecimalSafe(amount);
    if (!amount || amt.lte(0) || !amt.isFinite()) {
      errors.amount = "Amount must be greater than 0.";
    }

    if (!date) {
      errors.date = "Date is required.";
    }

    return errors;
  }, [customer, amount, date]);

  const hasErrors = !!validation.customer || !!validation.amount || !!validation.date;

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!customer) {
      setCustomerError("Please select a customer first.");
      return;
    }
    setCustomerError(null);

    if (hasErrors) {
      toast.error("Please fix the errors before saving.");
      return;
    }

    // Convert YYYY-MM-DD to ISO with current time.
    const isoDate = new Date(date).toISOString();

    recordPayment.mutate(
      {
        customerId: customer.id,
        amount,
        method,
        notes: notes.trim() || null,
        date: isoDate,
      },
      {
        onSuccess: (payment) => {
          toast.success(`Payment of ${formatMoney(payment.amount)} recorded`);
          router.push(`/payments/${payment.id}`);
        },
        onError: (error) => {
          const message =
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Failed to record payment.";
          toast.error(message);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Customer section */}
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-slate-700">
          1. Customer
        </h2>
        <CustomerPicker
          selected={customer}
          onSelect={setCustomer}
          error={customerError}
        />
      </section>

      {/* Amount + method + date section */}
      {customer ? (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-slate-700">
            2. Payment Details
          </h2>

          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            {/* Amount */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Amount received
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
                  className={cn(
                    "w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-lg font-bold tabular-nums text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2",
                    validation.amount
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                      : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30",
                  )}
                  autoFocus
                />
              </div>
              {validation.amount ? (
                <p className="mt-1 text-xs text-red-600">{validation.amount}</p>
              ) : null}
            </div>

            {/* Method */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Payment method
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-lg border py-2 text-xs font-medium transition-colors",
                      method === m.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    <span className="text-base leading-none">{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={todayIsoLocal()}
                className={cn(
                  "w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2",
                  validation.date
                    ? "border-red-300 focus:border-red-500 focus:ring-red-500/30"
                    : "border-slate-300 focus:border-brand-500 focus:ring-brand-500/30",
                )}
              />
              {validation.date ? (
                <p className="mt-1 text-xs text-red-600">{validation.date}</p>
              ) : null}
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Partial payment for last invoice"
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          {/* Soft warning (overpayment / no balance) */}
          {warning ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                warning.type === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-blue-200 bg-blue-50 text-blue-900",
              )}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning.message}</span>
            </div>
          ) : null}

          {/* Current balance summary */}
          {balanceQuery.data ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Customer&apos;s current balance:{" "}
              <span className="font-semibold text-slate-900">
                <Money value={balanceQuery.data.balance} />
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Sticky action bar */}
      <StickyFormActions
        onCancel={() => router.back()}
        onSave={handleSubmit}
        saveLabel="Save Payment"
        saveDisabled={hasErrors || !customer}
        isPending={recordPayment.isPending}
      />
    </div>
  );
}

/** Parse a user-entered decimal string safely. Returns 0 on parse failure. */
function parseDecimalSafe(value: string): Decimal {
  if (!value || value.trim() === "") return new Decimal(0);
  try {
    const d = new Decimal(value);
    return d.isFinite() ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}
