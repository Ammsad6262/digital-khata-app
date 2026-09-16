"use client";

/**
 * CustomerRow — one row in the customer/khata list.
 *
 * Shows: avatar initial, name, phone, balance badge.
 * Tappable → /khata/[id]
 */

import Link from "next/link";
import { Phone } from "lucide-react";
import type { CustomerSearchResult } from "@/lib/services/customers";
import { BalanceBadge } from "./BalanceBadge";

export function CustomerRow({ customer }: { customer: CustomerSearchResult }) {
  const initial = customer.name.charAt(0).toUpperCase();

  return (
    <Link
      href={`/khata/${customer.id}`}
      className="flex items-center gap-3 px-3 py-3 hover:bg-slate-50 active:bg-slate-100"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {customer.name}
        </p>
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <Phone className="h-3 w-3" />
          {customer.phone}
        </p>
      </div>

      <BalanceBadge balance={customer.balance} />
    </Link>
  );
}
