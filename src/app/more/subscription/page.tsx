"use client";
import Link from "next/link";
import { Crown, Check, ChevronRight, AlertCircle, RefreshCw, CheckCircle2, MessageCircle, KeyRound } from "lucide-react";
import { useSubscription, useRedemptionHistory } from "@/hooks/use-subscription";
import type { Entitlement } from "@/lib/services/entitlement";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { getWhatsAppLink, getDefaultWhatsAppMessage, getPlanWhatsAppMessage, WHATSAPP_NUMBER_DISPLAY } from "@/lib/utils/whatsapp";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

const INCLUDED_FEATURES = [
  "subscription.feature.customers",
  "subscription.feature.products",
  "subscription.feature.sales",
  "subscription.feature.expenses",
  "subscription.feature.dashboard",
  "subscription.feature.backup",
] as const;

export default function SubscriptionPage() {
  const { t } = useLanguage();
  return (
    <>
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning-ink">
          <Crown className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-ink">{t("subscription.title")}</h1>
          <p className="truncate text-xs text-ink-subtle">{t("subscription.subtitle")}</p>
        </div>
      </div>
      <main className="flex-1 px-4 pb-24 pt-4 min-h-[calc(100dvh-4rem)]">
        <SubscriptionContent />
      </main>
    </>
  );
}

function LicensingCard({ entitlement }: { entitlement: Entitlement }) {
  const { t, tParams } = useLanguage();
  const e = entitlement;
  const category = e.isOwner
    ? t("licensing.owner")
    : e.isAffiliate
      ? t("licensing.affiliate")
      : e.category === "PREMIUM"
        ? t("licensing.premium")
        : e.category === "TRIAL"
          ? t("licensing.trial")
          : e.category === "REGULAR"
            ? t("licensing.regular")
            : t("licensing.unactivated");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {t("licensing.currentAccess")}
      </p>
      <p className="mt-0.5 text-lg font-bold text-slate-900">{category}</p>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{t("licensing.product")}</span>
          <span
            className={cn(
              "font-semibold",
              e.core.active ? "text-brand-600" : "text-slate-400",
            )}
          >
            {e.core.trial
              ? e.core.active && e.core.expiresAt
                ? tParams("licensing.trialUntil", {
                    date: formatDate(new Date(e.core.expiresAt)),
                  })
                : t("licensing.trialEnded")
              : e.core.active
                ? t("licensing.permanent")
                : t("licensing.inactive")}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">{t("licensing.premium")}</span>
          <span
            className={cn(
              "font-semibold",
              e.premium.active ? "text-brand-600" : "text-slate-400",
            )}
          >
            {e.premium.active
              ? e.premium.permanent
                ? t("licensing.permanent")
                : tParams("licensing.daysLeft", {
                    days: e.premium.remainingDays ?? 0,
                  })
              : t("licensing.inactive")}
          </span>
        </div>
        {e.premium.active && !e.premium.permanent && e.premium.expiresAt ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t("licensing.expiresOn")}</span>
            <span className="font-medium text-slate-900">
              {formatDate(new Date(e.premium.expiresAt))}
            </span>
          </div>
        ) : null}
        {e.accessRevoked ? (
          <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
            {e.accessRevokedReason || t("licensing.inactive")}
          </p>
        ) : null}
        {!e.isOwner && !e.isAffiliate && !e.accessRevoked ? (
          <Link
            href="/more/redeem"
            className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {t("licensing.redeemNow")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Commercial plans. Payment is arranged over WhatsApp (there is no online
 * checkout in this build); the owner issues an activation code, which the
 * customer redeems on /more/redeem.
 *   Regular : Rs. 10,000 one-time  -> permanent core, no AI.
 *   Premium : Rs. 3,000 / 30 days  -> adds the AI assistant (needs active core).
 */
function PlansSection() {
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">{t("subscription.plans.title")}</h3>
        <p className="mt-0.5 text-xs text-ink-subtle">{t("subscription.plans.subtitle")}</p>
      </div>
      <PlanCard
        plan="REGULAR"
        name={t("subscription.plan.regular.name")}
        price={t("subscription.plan.regular.price")}
        period={t("subscription.plan.regular.period")}
        tagline={t("subscription.plan.regular.tagline")}
      />
      <PlanCard
        plan="PREMIUM"
        name={t("subscription.plan.premium.name")}
        price={t("subscription.plan.premium.price")}
        period={t("subscription.plan.premium.period")}
        tagline={t("subscription.plan.premium.tagline")}
        note={t("subscription.plan.premium.requires")}
        badge={t("subscription.plan.premium.badge")}
      />
    </div>
  );
}

function PlanCard({
  plan,
  name,
  price,
  period,
  tagline,
  note,
  badge,
}: {
  plan: "REGULAR" | "PREMIUM";
  name: string;
  price: string;
  period: string;
  tagline: string;
  note?: string;
  badge?: string;
}) {
  const { t } = useLanguage();
  const highlight = plan === "PREMIUM";
  return (
    <div className={cn("rounded-card border bg-surface shadow-card p-4", highlight ? "border-brand-300" : "border-line")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{name}</p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <span className="text-xl font-bold text-ink">{price}</span>
            <span className="text-xs text-ink-subtle">{period}</span>
          </p>
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">{tagline}</p>
      {note ? <p className="mt-1 text-[11px] text-ink-subtle">{note}</p> : null}
      <a
        href={getWhatsAppLink(getPlanWhatsAppMessage(plan))}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white"
      >
        <MessageCircle className="h-4 w-4" />
        {t("subscription.plan.cta")}
      </a>
    </div>
  );
}

function SubscriptionContent() {
  const { data: subscription, isLoading, isError, error, refetch } = useSubscription();
  const { data: history } = useRedemptionHistory();
  const { t } = useLanguage();

  if (isLoading) return <div className="space-y-4"><div className="h-48 animate-pulse rounded-2xl bg-surface-2" /><div className="h-32 animate-pulse rounded-xl bg-surface-2" /></div>;
  if (isError) return <EmptyState title={t("subscription.unableToCheck")} description={error instanceof Error ? error.message : ""} icon={<AlertCircle className="h-6 w-6" />} action={<Button onClick={() => refetch()} variant="outline" size="sm"><RefreshCw className="h-4 w-4" />{t("subscription.tryAgain")}</Button>} />;
  if (!subscription) return null;

  // Billing is not connected. Say so plainly: there is nothing to buy and no
  // feature is locked. No fake prices, no fake checkout, no trial pressure.
  if (!subscription.billingEnabled) {
    return (
      <div className="space-y-4">
<LicensingCard entitlement={subscription.licensing} />
        <PlansSection />
        <div className="space-y-2">
          <Link
            href="/more/redeem"
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-card transition-transform hover:scale-[1.02] active:scale-95"
          >
            <KeyRound className="h-5 w-5" />
            {t("subscription.redeemCode")}
          </Link>
          <p className="text-center text-xs text-ink-subtle">{t("subscription.alreadyHaveCode")}</p>
        </div>
        <div className="rounded-card border border-line bg-surface shadow-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">
            {t("subscription.whatsIncluded")}
          </h3>
          <div className="space-y-2">
            {INCLUDED_FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm text-ink-muted">
                <Check className="h-4 w-4 shrink-0 text-brand-600" />
                {t(feature)}
              </div>
            ))}
          </div>
        </div>
        {history && history.length > 0 ? (
          <div className="rounded-card border border-line bg-surface shadow-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">{t("subscription.activationHistory")}</h3>
            <div className="space-y-3">
              {history.map((entry) => (
                <div key={entry.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">
                      {entry.kind === "PREMIUM" ? `${entry.durationDays} days` : entry.kind === "PRODUCT" ? t("licensing.product") : t("licensing.affiliate")}
                    </span>
                    <span className="text-xs text-ink-subtle">{formatDate(new Date(entry.redeemedAt))}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-ink-subtle">
                    <span>→ {formatDate(new Date(entry.newAccessExpiresAt))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <p className="rounded-card border border-line bg-app px-3 py-2 text-[11px] leading-relaxed text-ink-subtle">
          {subscription.licensingEnforced
            ? t("subscription.licensingEnforcedDesc")
            : t("subscription.plans.payNote")}
        </p>
      </div>
    );
  }

  const isTrial = subscription.isTrial;
  const isActive = subscription.isActive;
  const isExpired = subscription.isExpired;
  const remainingDays = subscription.remainingDays ?? 0;
  const isExpiringSoon = remainingDays > 0 && remainingDays <= 7;
  const trialStartedAt = subscription.trialStartedAt ? new Date(subscription.trialStartedAt) : null;
  const trialExpiresAt = subscription.trialExpiresAt ? new Date(subscription.trialExpiresAt) : null;
  const effectiveExpiresAt = subscription.effectiveExpiresAt ? new Date(subscription.effectiveExpiresAt) : null;
  const accessStartedAt = subscription.accessStartedAt ? new Date(subscription.accessStartedAt) : null;
  const trialProgress = isTrial && trialStartedAt && trialExpiresAt
    ? Math.min(100, Math.max(0, ((Date.now() - trialStartedAt.getTime()) / (trialExpiresAt.getTime() - trialStartedAt.getTime())) * 100)) : 0;

  return (
    <div className="space-y-4">
<LicensingCard entitlement={subscription.licensing} />
      <div className={cn("overflow-hidden rounded-2xl border shadow-card", isExpired ? "border-line bg-surface" : isActive ? "border-brand-200 bg-surface" : "border-warning/25 bg-surface")}>
        <div className={cn("flex items-center gap-3 p-4", isExpired ? "bg-app" : isActive ? "bg-brand-50" : "bg-warning-soft")}>
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", isExpired ? "bg-surface-2 text-ink-muted" : isActive ? "bg-brand-600 text-white" : "bg-warning text-white")}>
            {isExpired ? <AlertCircle className="h-6 w-6" /> : isActive ? <CheckCircle2 className="h-6 w-6" /> : <Crown className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{isExpired ? t("subscription.trialEnded") : isTrial ? t("subscription.freeTrial") : t("subscription.activeAccess")}</p>
            {isActive ? <p className="text-xs text-ink-subtle">{remainingDays === 0 ? t("subscription.expiresToday") : `${remainingDays} ${remainingDays === 1 ? t("subscription.dayRemaining") : t("subscription.daysRemaining")}`}</p> : <p className="text-xs text-ink-subtle">{t("subscription.activateAccess")}</p>}
          </div>
        </div>
        <div className="space-y-3 p-4">
          {isActive && effectiveExpiresAt ? (
            <>
              {isTrial && (<div><div className="mb-1 flex items-center justify-between text-xs text-ink-subtle"><span>{t("subscription.trialEndsOn")}</span><span>{Math.round(trialProgress)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className={cn("h-full rounded-full transition-all", isExpiringSoon ? "bg-warning" : "bg-brand-600")} style={{ width: `${trialProgress}%` }} /></div></div>)}
              <div className="flex items-center justify-between text-sm"><span className="text-ink-subtle">{isTrial ? t("subscription.trialEndsOn") : t("subscription.accessExpires")}</span><span className="font-medium text-ink">{formatDate(effectiveExpiresAt)}</span></div>
              {!isTrial && accessStartedAt ? <div className="flex items-center justify-between text-sm"><span className="text-ink-subtle">{t("subscription.activatedOn")}</span><span className="font-medium text-ink">{formatDate(accessStartedAt)}</span></div> : null}
            </>
          ) : isExpired ? (
            <div className="space-y-3"><p className="text-sm text-ink-muted">{t("subscription.afterTrialDesc")}</p><p className="text-sm font-medium text-brand-600">{t("subscription.dataSafe")}</p></div>
          ) : null}
          {isActive && isExpiringSoon ? (<div className="rounded-lg bg-warning-soft p-3"><p className="text-xs font-medium text-warning-ink">{remainingDays} {remainingDays === 1 ? t("subscription.dayRemaining") : t("subscription.daysRemaining")}</p><p className="mt-0.5 text-xs text-warning-ink">{t("subscription.afterTrialDesc")}</p></div>) : null}
        </div>
      </div>
      <PlansSection />
      <div className="space-y-2">
        <a href={getWhatsAppLink(getDefaultWhatsAppMessage())} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-card transition-transform hover:scale-[1.02] active:scale-95"><MessageCircle className="h-5 w-5" />{t("subscription.contactUs")}</a>
        <p className="text-center text-xs text-ink-subtle">{WHATSAPP_NUMBER_DISPLAY}</p>
        <Link href="/more/redeem" className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-card transition-transform hover:scale-[1.02] active:scale-95"><KeyRound className="h-5 w-5" />{isActive ? t("subscription.redeemAnother") : t("subscription.redeemCode")}</Link>
      </div>
      <div className="rounded-card border border-line bg-surface shadow-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">{t("subscription.whatsIncluded")}</h3>
        <div className="space-y-2">{INCLUDED_FEATURES.map((f) => (<div key={f} className="flex items-center gap-2 text-sm text-ink-muted"><Check className="h-4 w-4 shrink-0 text-brand-600" />{t(f)}</div>))}</div>
      </div>
      {history && history.length > 0 ? (
<div className="rounded-card border border-line bg-surface shadow-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">{t("subscription.activationHistory")}</h3>
          <div className="space-y-3">{history.map((entry) => (<div key={entry.id} className="border-t border-line pt-3 first:border-0 first:pt-0"><div className="flex items-center justify-between text-sm"><span className="font-medium text-ink">{entry.kind === "PREMIUM" ? `${entry.durationDays} days` : entry.kind === "PRODUCT" ? t("licensing.product") : t("licensing.affiliate")}</span><span className="text-xs text-ink-subtle">{formatDate(new Date(entry.redeemedAt))}</span></div><div className="mt-1 flex items-center justify-between text-xs text-ink-subtle"><span>→ {formatDate(new Date(entry.newAccessExpiresAt))}</span></div></div>))}</div>
        </div>
      ) : null}
    </div>
  );
}
