"use client";

/**
 * Payment Recovery (/more/recovery).
 *
 * One row per customer who still owes money. The amount, the invoices, the
 * due date, the last payment and the last contact are all real records.
 *
 * Collecting an old debt is cash flow, not new revenue. Logging a contact or
 * creating a reminder never changes the balance; only a real payment does.
 */

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Loader2,
  MessageCircle,
  Phone,
  UserRound,
  Wallet,
} from "lucide-react";
import { ContactActions } from "@/components/shared/ContactActions";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import {
  useCreateRecoveryReminder,
  useLogRecoveryContact,
  useRecovery,
} from "@/hooks/use-recovery";
import { useSettings } from "@/hooks/use-settings";
import { useLanguage } from "@/providers/language-provider";
import { useToast } from "@/providers/toast-provider";
import { buildRecoveryMessage } from "@/lib/utils/recovery";
import type {
  RecoveryCandidate,
  RecoveryContactInput,
  RecoveryFactor,
  RecoveryFilter,
} from "@/lib/services/recovery";

const FILTERS: Array<{ value: RecoveryFilter; key: string }> = [
  { value: "all", key: "recovery.filter.all" },
  { value: "overdue", key: "recovery.filter.overdue" },
  { value: "due_soon", key: "recovery.filter.dueSoon" },
  { value: "no_due_date", key: "recovery.filter.noDueDate" },
];

const METHODS: Array<{ value: RecoveryContactInput["method"]; key: string }> = [
  { value: "call", key: "recovery.method.call" },
  { value: "whatsapp", key: "recovery.method.whatsapp" },
  { value: "sms", key: "recovery.method.sms" },
  { value: "in_person", key: "recovery.method.inPerson" },
  { value: "other", key: "recovery.method.other" },
];

function priorityStyle(priority: RecoveryCandidate["priority"]): string {
  if (priority === "high") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "normal") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function FactorLine({ factor }: { factor: RecoveryFactor }) {
  const { tParams } = useLanguage();
  return (
    <li className="flex items-start gap-1.5 text-[11px] text-slate-500">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
      <span>
        {tParams(`recovery.factor.${factor.code}` as never, factor.params)}
      </span>
    </li>
  );
}

function CandidateCard({ candidate }: { candidate: RecoveryCandidate }) {
  const { t, tParams } = useLanguage();
  const { data: settings } = useSettings();
  const toast = useToast();
  const logContact = useLogRecoveryContact();
  const remind = useCreateRecoveryReminder();
  const [method, setMethod] = useState<RecoveryContactInput["method"]>("call");

  const symbol = settings?.currencySymbol ?? "Rs.";
  const message = buildRecoveryMessage(candidate, { t, tParams }, symbol, {
    businessName: settings?.businessName,
  });

  const onLog = () => {
    logContact.mutate(
      { customerId: candidate.customerId, method },
      {
        onSuccess: () => toast.success(t("recovery.contactSaved")),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : t("common.failed")),
      },
    );
  };

  const onRemind = () => {
    remind.mutate(
      { customerId: candidate.customerId, days: 1 },
      {
        onSuccess: () => toast.success(t("recovery.reminderCreated")),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : t("common.failed")),
      },
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <UserRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Link
              href={`/khata/${candidate.customerId}`}
              className="block truncate text-sm font-semibold text-slate-900"
            >
              {candidate.customerName}
            </Link>
            {candidate.phone ? (
              <p className="truncate text-[11px] text-slate-500">{candidate.phone}</p>
            ) : null}
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityStyle(candidate.priority)}`}
        >
          {t(`recovery.priority.${candidate.priority}` as never)}
        </span>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] text-slate-500">{t("recovery.totalOutstanding")}</p>
          <p className="text-lg font-bold tabular-nums text-slate-900">
            <Money value={candidate.outstanding} symbol={symbol} />
          </p>
        </div>
        <div className="text-right">
          {candidate.daysOverdue > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              <AlertTriangle className="h-3 w-3" />
              {tParams("recovery.daysOverdue", { days: candidate.daysOverdue })}
            </span>
          ) : candidate.oldestDueDate ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <CalendarClock className="h-3 w-3" />
              {tParams("recovery.oldestDue", {
                date: new Date(candidate.oldestDueDate).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                }),
              })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {t("recovery.filter.noDueDate")}
            </span>
          )}
        </div>
      </div>

      <ul className="mt-2 space-y-0.5">
        {candidate.factors.map((factor) => (
          <FactorLine key={factor.code} factor={factor} />
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>
          {candidate.lastContactAt
            ? tParams("recovery.lastContact", {
                days: Math.max(
                  0,
                  Math.floor(
                    (Date.now() - new Date(candidate.lastContactAt).getTime()) /
                      86_400_000,
                  ),
                ),
              })
            : t("recovery.noContact")}
        </span>
        {candidate.nextReminderAt ? (
          <span className="font-medium text-brand-700">{t("recovery.nextReminder")}</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
        <ContactActions
          phone={candidate.phone}
          whatsappMessage={message}
          compact
        />
        <Link
          href={`/payments/new?customerId=${candidate.customerId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Wallet className="h-3.5 w-3.5" />
          {t("recovery.recordPayment")}
        </Link>
        <Link
          href={`/khata/${candidate.customerId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t("recovery.viewKhata")}
        </Link>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRemind}
          disabled={remind.isPending}
          className="h-7 px-2 text-[11px]"
        >
          {remind.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CalendarClock className="h-3.5 w-3.5" />
          )}
          {t("recovery.remindTomorrow")}
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as RecoveryContactInput["method"])}
          aria-label={t("recovery.logContact")}
          className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700"
        >
          {METHODS.map((item) => (
            <option key={item.value} value={item.value}>
              {t(item.key as never)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onLog}
          disabled={logContact.isPending}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
        >
          {logContact.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {t("recovery.logContact")}
        </button>
      </div>
    </div>
  );
}

export function RecoveryView() {
  const { t } = useLanguage();
  const { data: settings } = useSettings();
  const [filter, setFilter] = useState<RecoveryFilter>("all");
  const { data, isLoading, isError, refetch, isFetching } = useRecovery(filter);
  const symbol = settings?.currencySymbol ?? "Rs.";

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{t("recovery.error")}</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => refetch()}
        >
          {t("recovery.retry")}
        </Button>
      </div>
    );
  }

  const { summary, candidates } = data;

  return (
    <div className="space-y-4">
      <div>
        <p className="px-1 text-xs text-slate-500">{t("recovery.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] text-slate-500">{t("recovery.totalOutstanding")}</p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
            <Money value={summary.totalOutstanding} symbol={symbol} />
          </p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-[11px] text-red-600">{t("recovery.overdueAmount")}</p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-red-700">
            <Money value={summary.overdueOutstanding} symbol={symbol} />
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] text-slate-500">{t("recovery.customers")}</p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
            {summary.customersCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] text-slate-500">{t("recovery.overdueCustomers")}</p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
            {summary.overdueCustomersCount}
          </p>
        </div>
      </div>

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
        {isFetching ? (
          <Loader2 className="mt-1 h-4 w-4 animate-spin text-slate-400" />
        ) : null}
      </div>

      {candidates.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title={t("recovery.emptyTitle")}
          description={t("recovery.emptyDesc")}
        />
      ) : (
        <div className="space-y-2.5">
          {candidates.map((candidate) => (
            <CandidateCard key={candidate.customerId} candidate={candidate} />
          ))}
        </div>
      )}

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
        {t("recovery.note")}
      </p>
    </div>
  );
}
