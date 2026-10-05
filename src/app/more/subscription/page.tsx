"use client";

/**
 * Subscription & Access page.
 *
 * Shows the user's current subscription status with:
 *   - Trial active: progress bar + remaining days + included features
 *   - Active access: expiration date + activated on
 *   - Expired: WhatsApp contact + redeem code CTA
 *
 * WhatsApp button: 923183494917
 * Redeem code button: → /more/redeem
 */

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Crown,
  Check,
  Clock,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  MessageCircle,
  KeyRound,
  TrendingUp,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { useSubscription } from "@/hooks/use-subscription";
import { useRedemptionHistory } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { getWhatsAppLink, getDefaultWhatsAppMessage, WHATSAPP_NUMBER_DISPLAY } from "@/lib/utils/whatsapp";
import { formatDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

export default function SubscriptionPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("subscription.title")} />
      <ScreenContent>
        <SubscriptionContent />
      </ScreenContent>
    </>
  );
}

function SubscriptionContent() {
  const { data: subscription, isLoading, isError, error, refetch } = useSubscription();
  const { data: history } = useRedemptionHistory();
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-32 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title={t("subscription.unableToCheck")}
        description={error instanceof Error ? error.message : t("common.networkError")}
        icon={<AlertCircle className="h-6 w-6" />}
        action={
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
            {t("subscription.tryAgain")}
          </Button>
        }
      />
    );
  }

  if (!subscription) return null;

  const isTrial = subscription.isTrial;
  const isActive = subscription.isActive;
  const isExpired = subscription.isExpired;
  const remainingDays = subscription.remainingDays ?? 0;
  const isExpiringSoon = remainingDays > 0 && remainingDays <= 7;

  // Trial progress (0-100%)
  const trialProgress = isTrial && subscription.trialStartedAt && subscription.trialExpiresAt
    ? Math.min(100, Math.max(0, ((Date.now() - subscription.trialStartedAt.getTime()) /
        (subscription.trialExpiresAt.getTime() - subscription.trialStartedAt.getTime())) * 100))
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Status card ──────────────────────────────────────────── */}
      <div className={cn(
        "overflow-hidden rounded-2xl border shadow-sm",
        isExpired
          ? "border-slate-200 bg-white"
          : isActive
            ? "border-brand-200 bg-white"
            : "border-amber-200 bg-white",
      )}>
        {/* Status header */}
        <div className={cn(
          "flex items-center gap-3 p-4",
          isExpired
            ? "bg-slate-50"
            : isActive
              ? "bg-brand-50"
              : "bg-amber-50",
        )}>
          <div className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
            isExpired
              ? "bg-slate-200 text-slate-600"
              : isActive
                ? "bg-brand-600 text-white"
                : "bg-amber-500 text-white",
          )}>
            {isExpired ? (
              <Clock className="h-6 w-6" />
            ) : isActive ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : (
              <Crown className="h-6 w-6" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {isExpired
                ? t("subscription.trialEnded")
                : isTrial
                  ? t("subscription.freeTrial")
                  : t("subscription.activeAccess")}
            </p>
            {isActive ? (
              <p className="text-xs text-slate-500">
                {remainingDays === 0
                  ? t("subscription.expiresToday")
                  : `${remainingDays} ${remainingDays === 1 ? t("subscription.dayRemaining") : t("subscription.daysRemaining")}`}
              </p>
            ) : (
              <p className="text-xs text-slate-500">{t("subscription.activateAccess")}</p>
            )}
          </div>
        </div>

        {/* Status details */}
        <div className="space-y-3 p-4">
          {isActive && subscription.effectiveExpiresAt ? (
            <>
              {/* Progress bar for trial */}
              {isTrial && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{t("subscription.trialEndsOn")}</span>
                    <span>{Math.round(trialProgress)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        isExpiringSoon ? "bg-amber-500" : "bg-brand-600",
                      )}
                      style={{ width: `${trialProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {isTrial ? t("subscription.trialEndsOn") : t("subscription.accessExpires")}
                </span>
                <span className="font-medium text-slate-900">
                  {formatDate(subscription.effectiveExpiresAt)}
                </span>
              </div>
              {!isTrial && subscription.accessStartedAt ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{t("subscription.activatedOn")}</span>
                  <span className="font-medium text-slate-900">
                    {formatDate(subscription.accessStartedAt)}
                  </span>
                </div>
              ) : null}
            </>
          ) : isExpired ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {t("subscription.afterTrialDesc")}
              </p>
              <p className="text-sm font-medium text-brand-600">
                {t("subscription.dataSafe")}
              </p>
            </div>
          ) : null}

          {/* Expiring soon warning */}
          {isActive && isExpiringSoon ? (
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">
                {remainingDays} {remainingDays === 1 ? t("subscription.dayRemaining") : t("subscription.daysRemaining")}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                {t("subscription.afterTrialDesc")}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Action buttons ──────────────────────────────────────── */}
      <div className="space-y-2">
        {/* WhatsApp button */}
        <a
          href={getWhatsAppLink(getDefaultWhatsAppMessage())}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
        >
          <MessageCircle className="h-5 w-5" />
          {t("subscription.contactUs")}
        </a>
        <p className="text-center text-xs text-slate-500">
          {WHATSAPP_NUMBER_DISPLAY}
        </p>

        {/* Redeem code button */}
        <Link
          href="/more/redeem"
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
        >
          <KeyRound className="h-5 w-5" />
          {isActive ? t("subscription.redeemAnother") : t("subscription.redeemCode")}
        </Link>
      </div>

      {/* ── What's included ─────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          {t("subscription.whatsIncluded")}
        </h3>
        <div className="space-y-2">
          {[
            "Customers & Khata",
            "Products & Stock",
            "Sales & Payments",
            "Expenses & Reports",
            "Dashboard & Analytics",
            "Backup & Export",
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm text-slate-700">
              <Check className="h-4 w-4 shrink-0 text-brand-600" />
              {feature}
            </div>
          ))}
        </div>
      </div>

      {/* ── Activation history ──────────────────────────────────── */}
      {history && history.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">
            {t("subscription.activationHistory")}
          </h3>
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-900">
                    {entry.durationDays} days
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDate(entry.redeemedAt)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>→ {formatDate(entry.newAccessExpiresAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
