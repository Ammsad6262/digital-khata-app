"use client";

/**
 * BalanceBadge — displays a customer's balance with the right tone.
 *
 *   Positive balance → danger (customer owes money)
 *   Zero balance     → neutral (settled)
 *   Negative balance → info (advance payment — customer paid extra)
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
    ? "bg-danger-soft text-danger-ink ring-1 ring-danger/15"
    : isNegative
      ? "bg-info-soft text-info-ink ring-1 ring-info/15"
      : "bg-surface-2 text-ink-subtle ring-1 ring-line";

  const sizeClasses = {
    sm: "text-[11px] px-2 py-0.5",
    md: "text-[13px] px-2.5 py-1",
    lg: "text-[15px] px-3 py-1.5",
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
        "inline-flex items-center gap-1 rounded-full font-semibold tabular-nums",
        tone,
        sizeClasses,
        className,
      )}
      title={title}
    >
      {formatMoney(d.abs())}
      {size !== "lg" ? <span className="font-normal">· {label}</span> : null}
    </span>
  );
}