"use client";

/**
 * AuditView — a plain, newest-first record of important actions.
 *
 * This is an internal record, not a bank statement. It never invents an entry:
 * every row is written by the service that performed the real action.
 */

import { useMemo, useState } from "react";
import {
  History,
  Loader2,
  Package,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { useAuditLog } from "@/hooks/use-audit";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useLanguage } from "@/providers/language-provider";
import type { AuditLogView } from "@/lib/services/audit";

type AuditGroup = "all" | "financial" | "stock" | "people" | "system";

const FILTERS: Array<{ value: AuditGroup; key: string }> = [
  { value: "all", key: "audit.filter.all" },
  { value: "financial", key: "audit.filter.financial" },
  { value: "stock", key: "audit.filter.stock" },
  { value: "people", key: "audit.filter.people" },
  { value: "system", key: "audit.filter.system" },
];

const ACTION_KEYS: Record<string, string> = {
  "sale.create": "audit.action.saleCreate",
  "sale.void": "audit.action.saleVoid",
  "payment.create": "audit.action.paymentCreate",
  "payment.update": "audit.action.paymentUpdate",
  "payment.void": "audit.action.paymentVoid",
  "purchase.create": "audit.action.purchaseCreate",
  "purchase.void": "audit.action.purchaseVoid",
  "supplierPayment.create": "audit.action.supplierPaymentCreate",
  "supplierPayment.void": "audit.action.supplierPaymentVoid",
  "expense.create": "audit.action.expenseCreate",
  "expense.update": "audit.action.expenseUpdate",
  "expense.void": "audit.action.expenseVoid",
  "customer.create": "audit.action.customerCreate",
  "customer.update": "audit.action.customerUpdate",
  "customer.delete": "audit.action.customerDelete",
  "supplier.create": "audit.action.supplierCreate",
  "supplier.update": "audit.action.supplierUpdate",
  "supplier.delete": "audit.action.supplierDelete",
  "product.create": "audit.action.productCreate",
  "product.update": "audit.action.productUpdate",
  "product.delete": "audit.action.productDelete",
  "stock.adjust": "audit.action.stockAdjust",
  "settings.update": "audit.action.settingsUpdate",
  "backup.import": "audit.action.backupImport",
  "data.clear": "audit.action.dataClear",
  "recovery.contact": "audit.action.recoveryContact",
  "followUp.update": "audit.action.followUpUpdate",
  "password.reset_code_issued": "audit.action.passwordResetCodeIssued",
  "password.reset": "audit.action.passwordReset",
};

function groupFor(action: string): Exclude<AuditGroup, "all"> {
  if (
    action.startsWith("sale.") ||
    action.startsWith("payment.") ||
    action.startsWith("purchase.") ||
    action.startsWith("supplierPayment.") ||
    action.startsWith("expense.")
  ) {
    return "financial";
  }
  if (action.startsWith("stock.") || action.startsWith("product.")) {
    return "stock";
  }
  if (action.startsWith("customer.") || action.startsWith("supplier.")) {
    return "people";
  }
  return "system";
}

function GroupIcon({ group }: { group: Exclude<AuditGroup, "all"> }) {
  const className = "h-4 w-4";
  if (group === "financial") return <Wallet className={className} />;
  if (group === "stock") return <Package className={className} />;
  if (group === "people") return <Users className={className} />;
  return <Settings className={className} />;
}

function moneyFromMetadata(row: AuditLogView): string | null {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const candidate = record.amount ?? record.total;
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : null;
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AuditView() {
  const { t } = useLanguage();
  const symbol = useCurrencySymbol();
  const { data, isLoading, isError, refetch } = useAuditLog();
  const [filter, setFilter] = useState<AuditGroup>("all");

  const rows = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === "all") return all;
    return all.filter((row) => groupFor(row.action) === filter);
  }, [data, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, AuditLogView[]>();
    for (const row of rows) {
      const label = dayLabel(row.createdAt);
      const list = map.get(label) ?? [];
      list.push(row);
      map.set(label, list);
    }
    return [...map.entries()];
  }, [rows]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{t("audit.error")}</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => refetch()}
        >
          {t("audit.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="px-1 text-xs text-slate-500">{t("audit.subtitle")}</p>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              filter === item.value
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t(item.key as never)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title={t("audit.emptyTitle")}
          description={t("audit.emptyDesc")}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([label, items]) => (
            <div key={label}>
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {label}
              </p>
              <div className="space-y-1.5">
                {items.map((row) => {
                  const group = groupFor(row.action);
                  const amount = moneyFromMetadata(row);
                  const actionKey = ACTION_KEYS[row.action];
                  return (
                    <div
                      key={row.id}
                      className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <GroupIcon group={group} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">
                            {actionKey ? t(actionKey as never) : row.action}
                          </p>
                          <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                            {new Date(row.createdAt).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {row.summary ? (
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {row.summary}
                          </p>
                        ) : null}
                        {amount ? (
                          <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-slate-700">
                            <Money value={amount} symbol={symbol} />
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        {t("audit.note")}
      </p>
    </div>
  );
}
