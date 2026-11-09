"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Loader2,
  CheckCircle2,
  MessageCircle,
  AlertCircle,
  Sparkles,
  Crown,
  ShieldCheck,
} from "lucide-react";
import {
  useLicensing,
  useRedeemLicenseCode,
} from "@/hooks/use-licensing";
import { useRedemptionHistory } from "@/hooks/use-subscription";
import {
  getWhatsAppLink,
  getDefaultWhatsAppMessage,
  WHATSAPP_NUMBER_DISPLAY,
} from "@/lib/utils/whatsapp";
import { formatDate } from "@/lib/utils/date";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/providers/language-provider";
import { resolveApiError } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";
import type { Entitlement, LicenseRedeemResult } from "@/lib/services/entitlement";

export default function RedeemPage() {
  const { t } = useLanguage();
  return (
    <>
<div className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-3">
        <h1 className="text-base font-semibold text-ink">
          {t("subscription.redeemCode")}
        </h1>
      </div>
      <main className="flex-1 px-4 pb-24 pt-4 min-h-[calc(100dvh-4rem)]">
        <div className="space-y-4">
          <AccessCard />
          <RedeemContent />
          <RedemptionHistory />
        </div>
      </main>
    </>
  );
}

function categoryLabel(
  category: Entitlement["category"],
  t: ReturnType<typeof useLanguage>["t"],
): string {
  switch (category) {
    case "OWNER":
      return t("licensing.owner");
    case "AFFILIATE":
      return t("licensing.affiliate");
    case "PREMIUM":
      return t("licensing.premium");
    case "TRIAL":
      return t("licensing.trial");
    case "REGULAR":
      return t("licensing.regular");
    default:
      return t("licensing.unactivated");
  }
}

function kindLabel(
  kind: string,
  t: ReturnType<typeof useLanguage>["t"],
): string {
  if (kind === "PRODUCT") return t("licensing.product");
  if (kind === "AFFILIATE") return t("licensing.affiliate");
  return t("licensing.premium");
}

/** Compact summary of the customer's current commercial access. */
function AccessCard() {
  const { data, isLoading } = useLicensing();
  const { t, tParams } = useLanguage();
  if (isLoading || !data) return null;

  const premiumText = data.premium.active
    ? data.premium.permanent
      ? t("licensing.permanent")
      : tParams("licensing.daysLeft", {
          days: data.premium.remainingDays ?? 0,
        })
    : t("licensing.inactive");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            data.core.active
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-500",
          )}
        >
          {data.isOwner ? (
            <Crown className="h-5 w-5" />
          ) : (
            <ShieldCheck className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {t("licensing.currentAccess")}: {categoryLabel(data.category, t)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {t("licensing.product")}:{" "}
            {data.core.trial
              ? data.core.active && data.core.expiresAt
                ? tParams("licensing.trialUntil", {
                    date: formatDate(new Date(data.core.expiresAt)),
                  })
                : t("licensing.trialEnded")
              : data.core.active
                ? t("licensing.permanent")
                : t("licensing.unactivated")}
            {" · "}
            {t("licensing.premium")}: {premiumText}
          </p>
          {data.premium.active &&
          !data.premium.permanent &&
          data.premium.expiresAt ? (
            <p className="mt-0.5 text-xs text-slate-500">
              {t("licensing.expiresOn")}:{" "}
              {formatDate(new Date(data.premium.expiresAt))}
            </p>
          ) : null}
          {data.accessRevoked ? (
            <p className="mt-1 text-xs font-medium text-red-700">
              {data.accessRevokedReason || t("licensing.inactive")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RedeemContent() {
  const [code, setCode] = useState("");
  const [success, setSuccess] = useState<LicenseRedeemResult | null>(null);
  const redeem = useRedeemLicenseCode();
  const router = useRouter();
  const { t, tParams } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || redeem.isPending) return;
    setSuccess(null);
    redeem.mutate(code.trim(), {
      onSuccess: (data) => {
        setSuccess(data);
        setCode("");
      },
    });
  };

  if (success) {
    const successTitle =
      success.kind === "PRODUCT"
        ? t("licensing.productSuccess")
        : success.kind === "AFFILIATE"
          ? t("licensing.affiliateSuccess")
          : tParams("licensing.premiumSuccess", {
              date: formatDate(
                new Date(
                  success.premiumExpiresAt ?? success.newAccessExpiresAt,
                ),
              ),
            });

    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div className="relative mb-6">
          <Sparkles
            className="absolute -left-4 -top-2 h-4 w-4 text-brand-300"
            aria-hidden
          />
          <Sparkles
            className="absolute -right-3 top-1 h-3 w-3 text-brand-200"
            aria-hidden
          />
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
            <CheckCircle2 className="h-10 w-10 text-brand-600" />
          </div>
        </div>
        <h2 className="text-lg font-bold text-slate-900">
          {t("subscription.redeemSuccess")} 🎉
        </h2>
        <p className="mt-2 max-w-xs text-sm text-slate-500">{successTitle}</p>
        <div className="mt-6 w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t("licensing.kind")}</span>
            <span className="font-semibold text-slate-900">
              {kindLabel(success.kind, t)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              {success.kind === "PREMIUM"
                ? t("subscription.accessUntil")
                : t("licensing.currentAccess")}
            </span>
            <span className="font-semibold text-slate-900">
              {success.kind === "PREMIUM"
                ? formatDate(
                    new Date(
                      success.premiumExpiresAt ?? success.newAccessExpiresAt,
                    ),
                  )
                : t("licensing.permanent")}
            </span>
          </div>
        </div>
        <Button
          onClick={() => router.push("/dashboard")}
          className="mt-6 w-full max-w-xs"
          size="lg"
        >
          {t("subscription.continue")}
        </Button>
      </div>
    );
  }

  const errorMessage = redeem.error
    ? resolveApiError(redeem.error) || t("licensing.failed")
    : null;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
          <KeyRound className="h-8 w-8 text-brand-600" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">
          {t("subscription.redeemTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {t("subscription.redeemDesc")}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t("subscription.codePlaceholder")}
          className="w-full rounded-xl border border-slate-300 bg-white py-3.5 text-center text-lg font-mono font-semibold tracking-wider text-slate-900 placeholder:text-slate-300 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          disabled={redeem.isPending}
          aria-label={t("subscription.codePlaceholder")}
        />
        {errorMessage ? (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-800">{errorMessage}</p>
          </div>
        ) : null}
        <button
          type="submit"
          disabled={!code.trim() || redeem.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {redeem.isPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("subscription.redeeming")}
            </>
          ) : (
            <>
              <KeyRound className="h-5 w-5" />
              {t("subscription.redeemCode")}
            </>
          )}
        </button>
      </form>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-sm font-medium text-slate-700">
          {t("subscription.needCode")}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {t("subscription.contactUsDesc")}
        </p>
        <a
          href={getWhatsAppLink(getDefaultWhatsAppMessage())}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
        >
          <MessageCircle className="h-5 w-5" />
          {t("subscription.contactUs")}
        </a>
        <p className="mt-1.5 text-xs text-slate-500">
          {WHATSAPP_NUMBER_DISPLAY}
        </p>
      </div>
    </div>
  );
}

/** Recent redemptions, including which kind of code was used. */
function RedemptionHistory() {
  const { data: history } = useRedemptionHistory();
  const { t } = useLanguage();
  if (!history || history.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">
        {t("subscription.activationHistory")}
      </h3>
      <div className="space-y-3">
        {history.slice(0, 8).map((entry) => (
          <div
            key={entry.id}
            className="border-t border-slate-100 pt-3 first:border-0 first:pt-0"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-900">
                {kindLabel(entry.kind, t)}
              </span>
              <span className="text-xs text-slate-500">
                {formatDate(new Date(entry.redeemedAt))}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {entry.kind === "PREMIUM"
                ? `→ ${formatDate(new Date(entry.newAccessExpiresAt))}`
                : t("licensing.permanent")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
