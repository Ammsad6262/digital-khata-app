"use client";

/**
 * BalanceBadge — displays a customer's balance with the right tone.
 *
 *   Positive balance → red (customer owes money)
 *   Zero balance     → slate (settled)
 *   Negative balance → blue (advance payment — customer paid extra)
 *
 * V13: Wired into i18n — label and title use translation keys.
 */

import { Decimal } from "@/lib/utils/decimal";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

export function BalanceBadge({
  balance,
  className,
  size = "sm",
}: {
  balance: string | number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useLanguage();
  const d = new Decimal(balance);
  const isPositive = d.gt(0);
  const isNegative = d.lt(0);

  const tone = isPositive
    ? "bg-red-50 text-red-700 border-red-200"
    : isNegative
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-slate-100 text-slate-600 border-slate-200";

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  }[size];

  const label = isPositive
    ? t("customer.owes")
    : isNegative
      ? t("customer.advance")
      : t("customer.settled");

  const title = isPositive
    ? t("customer.outstandingBalance")
    : isNegative
      ? t("customer.advancePayment")
      : t("customer.noBalance");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold tabular-nums",
        tone,
        sizeClasses,
        className,
      )}
      title={title}
    >
      {formatMoney(d.abs())}
      {size !== "lg" ? <span className="opacity-70">· {label}</span> : null}
    </span>
  );
}
