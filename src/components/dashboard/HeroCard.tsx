"use client";

/**
 * Hero card — Total Receivables.
 *
 * The most important number on the dashboard. Big, green, prominent.
 * Shows the total amount customers owe + how many customers have balances.
 */

import { Users } from "lucide-react";
import { Money } from "@/components/shared/Money";

export function HeroCard({
  totalReceivables,
  customersWithBalance,
}: {
  totalReceivables: string;
  customersWithBalance: number;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg shadow-brand-600/20">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-brand-100">
            Total Receivables
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            <Money value={totalReceivables} />
          </p>
        </div>
        <div className="rounded-xl bg-white/15 p-2 backdrop-blur-sm">
          <Users className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-brand-100">
        <span className="font-semibold text-white">{customersWithBalance}</span>{" "}
        {customersWithBalance === 1 ? "customer owes" : "customers owe"} money
      </p>
    </div>
  );
}
