"use client";

/**
 * FollowUpsView — the sales-growth follow-up workflow.
 *
 * Three things, in the order the owner needs them:
 *   1. "Ready to contact" — customers who are past their own usual buying
 *      interval, with the evidence and a message already written.
 *   2. "Working on" — the opportunities the owner saved, with an editable
 *      message and one-tap outcome buttons.
 *   3. "Finished" — what actually happened, so the owner can see which
 *      follow-ups turned into orders.
 *
 * Nothing here sends a message. WhatsApp opens with the text prepared and
 * the owner presses send; the outcome is only ever what the owner records.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Loader2,
  MessageSquare,
  RotateCcw,
  UserRound,
  Wallet,
} from "lucide-react";
import { ContactActions } from "@/components/shared/ContactActions";
import { EmptyState } from "@/components/shared/EmptyState";
import { Money } from "@/components/shared/Money";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import {
  useCreateFollowUp,
  useFollowUpCandidates,
  useFollowUps,
  useUpdateFollowUp,
} from "@/hooks/use-follow-ups";
import { useLanguage } from "@/providers/language-provider";
import { useToast } from "@/providers/toast-provider";
import type {
  FollowUpCandidate,
  FollowUpOutcome,
  FollowUpStats,
  FollowUpView,
} from "@/lib/services/follow-ups";

const CLOSED: FollowUpOutcome[] = ["contacted", "interested", "order_placed", "not_interested", "no_response"];

const OUTCOME_STYLE: Record<FollowUpOutcome, string> = {
  pending: "border-slate-200 bg-slate-100 text-slate-600",
  contacted: "border-sky-200 bg-sky-50 text-sky-700",
  interested: "border-amber-200 bg-amber-50 text-amber-700",
  order_placed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  not_interested: "border-slate-200 bg-slate-100 text-slate-500",
  no_response: "border-slate-200 bg-slate-100 text-slate-500",
};

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Karachi",
  }).format(new Date(iso));
}

/** The message the owner will send — numbers come from the candidate only. */
function suggestedMessage(
  candidate: FollowUpCandidate,
  tParams: (key: never, params: Record<string, string | number>) => string,
): string {
  if (candidate.productName) {
    return tParams("followUps.suggested" as never, {
      name: candidate.customerName,
      product: candidate.productName,
      days: candidate.daysSinceLastPurchase,
      interval: candidate.averageIntervalDays ?? candidate.daysSinceLastPurchase,
    });
  }
  return tParams("followUps.suggestedGeneral" as never, {
    name: candidate.customerName,
    days: candidate.daysSinceLastPurchase,
  });
}

function OutcomeChip({ outcome }: { outcome: FollowUpOutcome }) {
  const { t } = useLanguage();
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${OUTCOME_STYLE[outcome]}`}
    >
      {t(`followUps.outcome.${outcome}` as never)}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Candidate — an opportunity found in purchase history
// ────────────────────────────────────────────────────────────────────────────

function CandidateCard({ candidate }: { candidate: FollowUpCandidate }) {
  const { t, tParams } = useLanguage();
  const toast = useToast();
  const create = useCreateFollowUp();

  const [message, setMessage] = useState(() => suggestedMessage(candidate, tParams));

  const start = () => {
    create.mutate(
      {
        customerId: candidate.customerId,
        productId: candidate.productId,
        kind: candidate.kind,
        reason: candidate.reason,
        message: message.trim(),
      },
      {
        onSuccess: () => toast.success(t("followUps.started")),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : t("common.failed")),
      },
    );
  };

  const alreadyOpen = Boolean(candidate.existingFollowUpId);

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
            <p className="mt-0.5 text-xs text-slate-500">
              {candidate.productName ? (
                <span className="font-medium text-slate-700">{candidate.productName}</span>
              ) : (
                t("followUps.candidates")
              )}
              {" · "}
              {tParams("followUps.lastPurchase", { days: candidate.daysSinceLastPurchase })}
            </p>
          </div>
        </div>

        {candidate.balance && candidate.balance !== "0" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            <Wallet className="h-3 w-3" />
            <Money value={candidate.balance} />
          </span>
        ) : (
          <span className="shrink-0 text-[10px] text-slate-400">{t("followUps.noBalance")}</span>
        )}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-600">{candidate.reason}</p>

      {candidate.averageIntervalDays ? (
        <p className="mt-0.5 text-[11px] text-slate-400">
          {tParams("followUps.usualInterval", { days: candidate.averageIntervalDays })}
        </p>
      ) : null}

      <TextArea
        label={t("followUps.message")}
        hint={t("followUps.messageHint")}
        className="mt-2.5 min-h-[72px] text-xs"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={1000}
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <ContactActions phone={candidate.customerPhone} whatsappMessage={message} compact />
        {alreadyOpen ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Check className="h-3 w-3" />
            {t("followUps.existing")}
          </span>
        ) : (
          <Button size="sm" onClick={start} disabled={create.isPending || !message.trim()}>
            {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("followUps.start")}
          </Button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Open follow-up — edit the message, record what happened
// ────────────────────────────────────────────────────────────────────────────

function FollowUpCard({ followUp }: { followUp: FollowUpView }) {
  const { t } = useLanguage();
  const toast = useToast();
  const update = useUpdateFollowUp(followUp.id);

  const [message, setMessage] = useState(followUp.message);
  useEffect(() => setMessage(followUp.message), [followUp.message]);

  const dirty = message.trim() !== followUp.message.trim();

  const saveMessage = () => {
    update.mutate(
      { message: message.trim() },
      {
        onSuccess: () => toast.success(t("followUps.marked")),
        onError: (err) => toast.error(err instanceof Error ? err.message : t("common.failed")),
      },
    );
  };

  const setOutcome = (outcome: FollowUpOutcome) => {
    update.mutate(
      { outcome },
      {
        onSuccess: () => toast.success(t("followUps.marked")),
        onError: (err) => toast.error(err instanceof Error ? err.message : t("common.failed")),
      },
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/khata/${followUp.customerId}`}
            className="block truncate text-sm font-semibold text-slate-900"
          >
            {followUp.customerName}
          </Link>
          {followUp.productName ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">{followUp.productName}</p>
          ) : null}
        </div>
        <OutcomeChip outcome={followUp.outcome} />
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{followUp.reason}</p>

      <TextArea
        label={t("followUps.message")}
        className="mt-2.5 min-h-[72px] text-xs"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={1000}
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <ContactActions phone={followUp.customerPhone} whatsappMessage={message} compact />
        {dirty ? (
          <Button size="sm" variant="outline" onClick={saveMessage} disabled={update.isPending}>
            {t("common.save")}
          </Button>
        ) : null}
      </div>

      <div className="mt-3 border-t border-slate-100 pt-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {t("followUps.mark")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CLOSED.map((outcome) => (
            <button
              key={outcome}
              type="button"
              onClick={() => setOutcome(outcome)}
              disabled={update.isPending || followUp.outcome === outcome}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${
                followUp.outcome === outcome
                  ? OUTCOME_STYLE[outcome]
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t(`followUps.outcome.${outcome}` as never)}
            </button>
          ))}
        </div>

        {followUp.outcome === "order_placed" ? (
          <div className="mt-2.5 rounded-lg bg-emerald-50 p-2.5">
            <p className="text-[11px] text-emerald-800">{t("followUps.orderHint")}</p>
            <Link
              href={`/sales/new?customerId=${followUp.customerId}`}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 underline"
            >
              {t("followUps.recordSale")}
              <ArrowRight className="h-3 w-3 rtl-flip" />
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Finished follow-up — compact row, reopen if they change their mind
// ────────────────────────────────────────────────────────────────────────────

function ResolvedRow({ followUp }: { followUp: FollowUpView }) {
  const { t } = useLanguage();
  const toast = useToast();
  const update = useUpdateFollowUp(followUp.id);

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/khata/${followUp.customerId}`}
            className="truncate text-xs font-semibold text-slate-900"
          >
            {followUp.customerName}
          </Link>
          <OutcomeChip outcome={followUp.outcome} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {followUp.productName ? `${followUp.productName} · ` : ""}
          {shortDate(followUp.resolvedAt ?? followUp.updatedAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          update.mutate(
            { outcome: "pending" },
            {
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : t("common.failed")),
            },
          )
        }
        disabled={update.isPending}
        aria-label={t("followUps.open")}
        className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: FollowUpStats }) {
  const { t, tParams } = useLanguage();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-50 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {t("followUps.stats.worked")}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{stats.worked}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {t("followUps.stats.orders")}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{stats.orderPlaced}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {t("followUps.stats.conversion")}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">
            {stats.conversionPct === null ? "—" : `${stats.conversionPct}%`}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {tParams("followUps.stats.conversionHint", {
          orders: stats.orderPlaced,
          worked: stats.worked,
        })}
      </p>
    </div>
  );
}

export function FollowUpsView() {
  const { t } = useLanguage();
  const candidates = useFollowUpCandidates();
  const open = useFollowUps("open");
  const resolved = useFollowUps("resolved");

  const isLoading = candidates.isLoading || open.isLoading;
  const isError = candidates.isError && open.isError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {t("followUps.error")}
        <button
          type="button"
          onClick={() => {
            candidates.refetch();
            open.refetch();
          }}
          className="ml-2 underline"
        >
          {t("followUps.retry")}
        </button>
      </div>
    );
  }

  const candidateItems = candidates.data?.items ?? [];
  const openItems = open.data?.items ?? [];
  const resolvedItems = resolved.data?.items ?? [];
  const stats: FollowUpStats =
    open.data?.stats ??
    ({
      open: 0,
      contacted: 0,
      interested: 0,
      orderPlaced: 0,
      notInterested: 0,
      noResponse: 0,
      worked: 0,
      conversionPct: null,
    } satisfies FollowUpStats);

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-2 flex items-start gap-2">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <MessageSquare className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{t("followUps.subtitle")}</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">{t("followUps.candidatesHint")}</p>
          </div>
        </div>

        {candidateItems.length === 0 ? (
          <EmptyState
            icon={<UserRound className="h-5 w-5" />}
            title={t("followUps.noCandidates")}
            description={t("followUps.noCandidatesHint")}
          />
        ) : (
          <div className="space-y-2.5">
            {candidateItems.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} />
            ))}
          </div>
        )}
      </section>

      <StatsStrip stats={stats} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">{t("followUps.open")}</h2>
        {openItems.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/50 p-4 text-center text-xs text-slate-500">
            {t("followUps.noOpen")}
          </p>
        ) : (
          <div className="space-y-2.5">
            {openItems.map((item) => (
              <FollowUpCard key={item.id} followUp={item} />
            ))}
          </div>
        )}
      </section>

      {resolvedItems.length > 0 ? (
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{t("followUps.resolved")}</h2>
            <span className="text-[11px] text-slate-400">{resolvedItems.length}</span>
          </div>
          <div className="space-y-1.5">
            {resolvedItems.slice(0, 20).map((item) => (
              <ResolvedRow key={item.id} followUp={item} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{t("followUps.closedHint")}</p>
        </section>
      ) : null}
    </div>
  );
}
