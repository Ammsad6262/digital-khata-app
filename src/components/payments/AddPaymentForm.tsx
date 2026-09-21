"use client";

/**
 * AddPaymentForm — fast payment entry.
 *
 * Fields:
 *   - Customer (search by name/phone)
 *     · Pre-filled when ?customerId=X is in the URL (e.g. from a customer's
 *       Khata page's "Add Payment" button)
 *     · Pre-filled + LOCKED when ?saleId=X is in the URL (e.g. from a Sale
 *       Detail page's "Record Payment" button — both customer and sale are
 *       fixed, user only enters amount + method)
 *   - Amount (must be > 0)
 *     · When a sale is linked: defaults to the sale's outstanding amount,
 *       and a "Full amount" quick-fill button is shown.
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

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { AlertCircle, Lock, ShoppingCart } from "lucide-react";
import { CustomerPicker, type SelectedCustomer } from "@/components/sales/CustomerPicker";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { Money } from "@/components/shared/Money";
import { useRecordPayment } from "@/hooks/use-payments";
import { useSale } from "@/hooks/use-sales";
import { useCustomerBalance } from "@/hooks/use-customer-balance";
import { useToast } from "@/providers/toast-provider";
import { ApiError } from "@/lib/utils/api-client";
import { Decimal } from "@/lib/utils/decimal";
import { formatMoney } from "@/lib/utils/money";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

type Method = "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other";

type MethodLabelKey = "payment.cash" | "payment.bank" | "payment.cheque" | "payment.jazzcash" | "payment.easypaisa" | "payment.other";
const METHODS: Array<{ value: Method; labelKey: MethodLabelKey; icon: string }> = [
  { value: "cash",      labelKey: "payment.cash",      icon: "💵" },
  { value: "bank",      labelKey: "payment.bank",      icon: "🏦" },
  { value: "cheque",    labelKey: "payment.cheque",    icon: "📝" },
  { value: "jazzcash",  labelKey: "payment.jazzcash",  icon: "📱" },
  { value: "easypaisa", labelKey: "payment.easypaisa", icon: "📱" },
  { value: "other",     labelKey: "payment.other",     icon: "•" },
];

function todayIsoLocal(): string {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

export function AddPaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const recordPayment = useRecordPayment();
  const { t } = useLanguage();

  // ?saleId=X (from Sale Detail → "Record Payment") — if present, we lock
  // the customer + sale and pre-fill the amount with the sale's outstanding.
  const linkedSaleId = searchParams.get("saleId");

  const [customer, setCustomer] = useState<SelectedCustomer | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<Method>("cash");
  const [date, setDate] = useState<string>(todayIsoLocal());
  const [notes, setNotes] = useState<string>("");
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Fetch the linked sale (if ?saleId=X). This gives us:
  //   - customer.id + name + phone (to pre-fill the customer picker)
  //   - outstanding amount (to default the amount input)
  //   - totalAmount + paidAmount (for the linked-sale summary card)
  const saleQuery = useSale(linkedSaleId);
  const linkedSale = saleQuery.data;

  // When the linked sale loads, pre-fill the customer + default amount.
  useEffect(() => {
    if (!linkedSale) return;
    setCustomer({
      id: linkedSale.customerId,
      name: linkedSale.customerName,
      phone: linkedSale.customerPhone,
      balance: "0", // we don't need the customer's overall balance for sale-linked payments
    });
    // Default the amount to the sale's outstanding (only if user hasn't typed anything yet).
    const outstanding = new Decimal(linkedSale.outstanding);
    if (outstanding.gt(0)) {
      setAmount((prev) => (prev.trim() === "" ? outstanding.toString() : prev));
    }
  }, [linkedSale]);

  // Fetch the customer's current balance whenever a customer is selected,
  // so we can show overpayment warnings. (Only relevant when NOT linked to
  // a sale — when linked, we already know the sale's outstanding.)
  const balanceQuery = useCustomerBalance(customer?.id ?? null);

  // ── Compute warnings (soft, non-blocking) ──────────────────────────────
  const warning = useMemo(() => {
    if (!customer) return null;
    const enteredAmount = parseDecimalSafe(amount);
    if (enteredAmount.lte(0)) return null;

    // If linked to a sale, the "current balance" of interest is the sale's
    // outstanding, not the customer's overall balance.
    if (linkedSale) {
      const saleOutstanding = new Decimal(linkedSale.outstanding);
      if (enteredAmount.gt(saleOutstanding)) {
        const overpay = enteredAmount.minus(saleOutstanding);
        return {
          type: "warning" as const,
          message: `${t("payment.overpayPrefix")} ${formatMoney(saleOutstanding)}. ${t("payment.overpayMiddle")} ${formatMoney(enteredAmount)} ${t("payment.overpayCreate")} ${formatMoney(overpay)} ${t("payment.overpaySuffix")}`,
        };
      }
      return null;
    }

    // Otherwise (no linked sale) — use the customer's overall balance.
    if (!balanceQuery.data) return null;
    const currentBalance = new Decimal(balanceQuery.data.balance);

    if (currentBalance.lte(0)) {
      return {
        type: "info" as const,
        message: `${t("payment.noBalancePrefix")} ${formatMoney(currentBalance)}${t("payment.noBalanceSuffix")}`,
      };
    }

    if (enteredAmount.gt(currentBalance)) {
      const overpay = enteredAmount.minus(currentBalance);
      return {
        type: "warning" as const,
        message: `${t("payment.overpayPrefix")} ${formatMoney(currentBalance)}. ${t("payment.overpayMiddle")} ${formatMoney(enteredAmount)} ${t("payment.overpayCreate")} ${formatMoney(overpay)} ${t("payment.overpaySuffix")}`,
      };
    }

    return null;
  }, [customer, balanceQuery.data, amount, linkedSale]);

  // ── Validation ───────────────────────────────────────────────────────
  const validation = useMemo(() => {
    const errors: { customer?: string; amount?: string; date?: string } = {};

    if (!customer) {
      errors.customer = t("sale.selectCustomer");
    }

    const amt = parseDecimalSafe(amount);
    if (!amount || amt.lte(0) || !amt.isFinite()) {
      errors.amount = t("payment.amountGtZero");
    }

    if (!date) {
      errors.date = t("payment.dateRequired");
    }

    return errors;
  }, [customer, amount, date]);

  const hasErrors = !!validation.customer || !!validation.amount || !!validation.date;

  // ── Submit ───────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!customer) {
      setCustomerError(t("sale.selectCustomerFirst"));
      return;
    }
    setCustomerError(null);

    if (hasErrors) {
      toast.error(t("common.fixErrorsBeforeSaving"));
      return;
    }

    const isoDate = new Date(date).toISOString();

    recordPayment.mutate(
      {
        customerId: customer.id,
        // Link the payment to the sale when ?saleId=X was provided.
        // This causes the backend to atomically update the sale's
        // paidAmount + outstanding columns in the same transaction.
        saleId: linkedSaleId,
        amount,
        method,
        notes: notes.trim() || null,
        date: isoDate,
      },
      {
        onSuccess: (payment) => {
          toast.success(t("payment.paymentRecorded"));
          // If the payment was for a specific sale, go back to that sale's
          // detail page (so the user sees the updated outstanding amount).
          // Otherwise, go to the payment's own detail page.
          if (linkedSaleId) {
            router.push(`/sales/${linkedSaleId}`);
          } else {
            router.push(`/payments/${payment.id}`);
          }
        },
        onError: (error) => {
          const message =
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : t("common.failed");
          toast.error(message);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Linked sale summary card — shown only when ?saleId=X.
          Tells the user WHICH sale they're paying for. */}
      {linkedSale ? (
        <LinkedSaleCard
          sale={linkedSale}
          // Disable the customer picker when linked to a sale (the customer
          // is fixed — the payment must go to the sale's customer).
          onClearSale={() => {
            // No-op — when linked, we don't allow clearing.
            // (User can press the back button to leave this flow.)
          }}
          locked
        />
      ) : null}

      {/* Customer section — hidden when linked to a sale (customer is pre-filled + locked) */}
      {linkedSale ? null : (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-slate-700">
            1. {t("sale.customer")}
          </h2>
          <CustomerPicker
            selected={customer}
            onSelect={setCustomer}
            error={customerError}
          />
        </section>
      )}

      {/* Amount + method + date section */}
      {customer ? (
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-slate-700">
            {linkedSale ? "1." : "2."} {t("payment.paymentMethod")}
          </h2>

          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
            {/* Amount */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("payment.amountReceived")}
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

              {/* "Full amount" quick-fill button — only when a sale is linked
                  and the user hasn't already entered the full amount. */}
              {linkedSale && new Decimal(linkedSale.outstanding).gt(0) ? (
                <button
                  type="button"
                  onClick={() => setAmount(linkedSale.outstanding)}
                  className="mt-1.5 rounded-md bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                >
                  {t("payment.fullAmount")}: <Money value={linkedSale.outstanding} />
                </button>
              ) : null}
            </div>

            {/* Method */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                {t("payment.paymentMethod")}
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
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {t("payment.date")}
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
                {t("payment.paymentNotes")}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("payment.paymentNotesPlaceholder")}
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

          {/* Current balance summary — only show when not linked to a sale
              (when linked, the linked-sale card above already shows the relevant outstanding) */}
          {!linkedSale && balanceQuery.data ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {t("customer.currentBalance")}:{" "}
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
        saveLabel={t("payment.savePayment")}
        saveDisabled={hasErrors || !customer}
        isPending={recordPayment.isPending}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// LinkedSaleCard — shows the sale this payment is being recorded against.
// Displayed at the top of the form when ?saleId=X is in the URL.
// ────────────────────────────────────────────────────────────────────────────

function LinkedSaleCard({
  sale,
  onClearSale,
  locked,
}: {
  sale: NonNullable<ReturnType<typeof useSale>["data"]>;
  onClearSale: () => void;
  locked?: boolean;
}) {
  const { t } = useLanguage();
  const total = new Decimal(sale.totalAmount);
  const paid = new Decimal(sale.paidAmount);
  const outstanding = new Decimal(sale.outstanding);

  return (
    <div className="rounded-xl border-2 border-brand-200 bg-brand-50/50 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100">
          <ShoppingCart className="h-5 w-5 text-brand-700" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-brand-700">
              {t("payment.linkedSale")}
            </p>
            {locked ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-brand-100 px-1 py-0.5 text-[9px] font-semibold text-brand-700">
                <Lock className="h-2 w-2" />
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatDateTime(new Date(sale.date))}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {sale.customerName}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            {t("payment.saleOutstanding")}
          </p>
          <p className="text-lg font-bold tabular-nums text-red-600">
            <Money value={sale.outstanding} />
          </p>
        </div>
      </div>
      {/* Mini breakdown: total / paid / outstanding */}
      <div className="mt-2 grid grid-cols-3 gap-1 border-t border-brand-200 pt-2 text-center">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-slate-500">{t("sale.total")}</p>
          <p className="text-xs font-semibold tabular-nums text-slate-900">
            <Money value={total.toString()} />
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wide text-slate-500">{t("sale.paid")}</p>
          <p className="text-xs font-semibold tabular-nums text-brand-700">
            <Money value={paid.toString()} />
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wide text-slate-500">{t("sale.due")}</p>
          <p className="text-xs font-semibold tabular-nums text-red-600">
            <Money value={outstanding.toString()} />
          </p>
        </div>
      </div>
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
