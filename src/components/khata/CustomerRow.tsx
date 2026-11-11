"use client";

/**
 * CustomerRow — one row in the customer/khata list.
 *
 * Shows: avatar initial, name, phone, balance badge.
 * Customers with a positive balance (they owe money) also get one-tap Call and
 * WhatsApp buttons so the owner can follow up without opening the ledger.
 * Tapping the row → /khata/[id].
 */

import Link from "next/link";
import { Phone } from "lucide-react";
import type { CustomerSearchResult } from "@/lib/services/customers";
import { useLanguage } from "@/providers/language-provider";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { formatMoney } from "@/lib/utils/money";
import { Decimal } from "@/lib/utils/decimal";
import { ContactActions } from "@/components/shared/ContactActions";
import { BalanceBadge } from "./BalanceBadge";

export function CustomerRow({ customer }: { customer: CustomerSearchResult }) {
  const { t, tParams } = useLanguage();
  const symbol = useCurrencySymbol();
  const initial = customer.name.charAt(0).toUpperCase();
  const owesMoney = new Decimal(customer.balance).gt(0);
  const whatsappMessage = tParams("customer.followUpMessage", {
    name: customer.name,
    amount: formatMoney(customer.balance, symbol),
  });

  return (
    <div className="flex items-center gap-2 px-3 py-3 hover:bg-app active:bg-surface-2">
      <Link
        href={`/khata/${customer.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {initial}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {customer.name}
          </p>
          {customer.companyName ? (
            <p className="truncate text-[11px] text-ink-subtle">
              {customer.companyName}
            </p>
          ) : null}
          {customer.phone ? (
            <p className="flex items-center gap-1 text-xs text-ink-subtle">
              <Phone className="h-3 w-3" />
              {customer.phone}
            </p>
          ) : (
            <p className="text-xs text-ink-faint">{t("common.noPhone")}</p>
          )}
        </div>

        <BalanceBadge balance={customer.balance} />
      </Link>

      {owesMoney ? (
        <ContactActions
          phone={customer.phone}
          whatsappMessage={whatsappMessage}
          compact
          iconOnly
        />
      ) : null}
    </div>
  );
}
