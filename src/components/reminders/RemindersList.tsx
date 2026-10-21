"use client";

/**
 * RemindersList — filterable list of reminders with one-tap complete.
 */

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Circle } from "lucide-react";
import { ContactActions } from "@/components/shared/ContactActions";
import { useReminders, useSetReminderCompleted } from "@/hooks/use-reminders";
import { useCurrencySymbol } from "@/hooks/use-currency-symbol";
import { useLanguage } from "@/providers/language-provider";
import { useToast } from "@/providers/toast-provider";
import { formatMoney } from "@/lib/utils/money";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import type { ReminderFilter, ReminderView } from "@/lib/services/reminders";

const TABS = [
  { value: "today", labelKey: "reminders.today", countKey: "today" },
  { value: "overdue", labelKey: "reminders.overdue", countKey: "overdue" },
  { value: "upcoming", labelKey: "reminders.upcoming", countKey: "upcoming" },
  { value: "completed", labelKey: "reminders.completed", countKey: "completed" },
  { value: "all", labelKey: "reminders.all", countKey: undefined },
] as const;

const TYPE_KEYS = {
  payment_collection: "reminderType.payment_collection",
  supplier_payment: "reminderType.supplier_payment",
  customer_followup: "reminderType.customer_followup",
  stock_reorder: "reminderType.stock_reorder",
  custom: "reminderType.custom",
} as const;

type ReminderCountsLike = {
  overdue: number;
  today: number;
  upcoming: number;
  completed: number;
};

function dueLabel(dueAt: Date | string): string {
  return new Date(dueAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function RemindersList() {
  const { t, tParams } = useLanguage();
  const toast = useToast();
  const symbol = useCurrencySymbol();
  const [filter, setFilter] = useState<ReminderFilter>("today");
  const { data, isLoading, isError, error } = useReminders(filter);
  const toggle = useSetReminderCompleted();

  const now = Date.now();

  async function onToggle(reminder: ReminderView) {
    try {
      await toggle.mutateAsync({
        id: reminder.id,
        completed: !reminder.completedAt,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.failed"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((tab) => {
          const active = filter === tab.value;
          const count = tab.countKey ? data?.counts?.[tab.countKey] : undefined;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t(tab.labelKey)}
              {typeof count === "number" && count > 0 ? (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                    active ? "bg-white/20" : "bg-white text-slate-600"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-600">
          {error instanceof Error ? error.message : t("common.couldntLoad")}
        </p>
      ) : !data || data.items.length === 0 ? (
        filter === "all" ? (
          <EmptyState
            title={t("reminders.empty")}
            description={t("reminders.emptyHint")}
            icon={<Bell className="h-6 w-6" />}
            action={
              <Link href="/more/reminders/new">
                <Button size="sm">{t("reminders.add")}</Button>
              </Link>
            }
          />
        ) : (
          <EmptyState title={t("reminders.noneInFilter")} icon={<CheckCircle2 className="h-6 w-6" />} />
        )
      ) : (
        <ul className="space-y-2">
          {data.items.map((r) => {
            const done = !!r.completedAt;
            const due = new Date(r.dueAt).getTime();
            const overdue = !done && due < now - 60_000;
            const isToday =
              !done &&
              !overdue &&
              new Date(r.dueAt).toDateString() === new Date().toDateString();

            const context =
              r.customerName ?? r.supplierName ?? r.productName ?? null;
            const typeKey =
              TYPE_KEYS[r.type as keyof typeof TYPE_KEYS] ?? "reminderType.custom";

            const contactName = r.customerName ?? r.supplierName ?? "";
            const phone = r.customerPhone ?? r.supplierPhone ?? null;
            const balanceText =
              r.customerBalance && Number(r.customerBalance) > 0
                ? formatMoney(r.customerBalance, symbol)
                : null;
            const waMessage = phone
              ? r.customerId
                ? balanceText
                  ? tParams("reminders.waMessageAmount", {
                      name: contactName,
                      title: r.title,
                      amount: balanceText,
                    })
                  : tParams("reminders.waMessage", { name: contactName, title: r.title })
                : tParams("reminders.waSupplierMessage", { name: contactName, title: r.title })
              : undefined;

            return (
              <li
                key={r.id}
                className={`rounded-xl border bg-white p-3 ${
                  overdue ? "border-red-200" : "border-slate-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => onToggle(r)}
                    disabled={toggle.isPending}
                    className="mt-0.5 shrink-0 text-slate-400 hover:text-brand-600"
                    aria-label={done ? t("reminders.markIncomplete") : t("reminders.markComplete")}
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-brand-600" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <Link href={`/more/reminders/${r.id}`} className="block">
                      <p
                        className={`text-sm font-medium ${
                          done ? "text-slate-400 line-through" : "text-slate-900"
                        }`}
                      >
                        {r.title}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span
                          className={
                            overdue
                              ? "font-medium text-red-600"
                              : isToday
                                ? "font-medium text-amber-700"
                                : "text-slate-500"
                          }
                        >
                          {overdue ? <AlertTriangle className="mr-0.5 inline h-3 w-3" /> : null}
                          {dueLabel(r.dueAt)}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {t(typeKey)}
                        </span>
                        {r.priority === "high" ? (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                            {t("reminderPriority.high")}
                          </span>
                        ) : null}
                      </div>
                      {context ? (
                        <p className="mt-1 truncate text-xs text-slate-500">{context}</p>
                      ) : null}
                      {balanceText ? (
                        <p className="mt-1 text-xs font-semibold text-slate-800">
                          {t("reminders.owes")} {balanceText}
                        </p>
                      ) : null}
                    </Link>

                    {phone ? (
                      <ContactActions
                        phone={phone}
                        whatsappMessage={waMessage}
                        className="mt-2"
                        compact
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
