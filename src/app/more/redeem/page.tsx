"use client";

/**
 * Redeem Code page.
 *
 * Input: activation code (auto-normalized: trimmed, uppercased).
 * On submit → POST /api/subscription/redeem
 * On success → show success card with new expiration date + Continue button.
 * On error → show user-friendly error message (no raw API errors).
 *
 * Also shows a WhatsApp contact button for users who need a code.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  CheckCircle2,
  MessageCircle,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ScreenContent } from "@/components/layout/Screen";
import { useRedeemCode } from "@/hooks/use-subscription";
import { getWhatsAppLink, getDefaultWhatsAppMessage, WHATSAPP_NUMBER_DISPLAY } from "@/lib/utils/whatsapp";
import { formatDate } from "@/lib/utils/date";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/providers/language-provider";
import { ApiError } from "@/lib/utils/api-client";

export default function RedeemPage() {
  const { t } = useLanguage();
  return (
    <>
      <AppHeader title={t("subscription.redeemCode")} />
      <ScreenContent>
        <RedeemContent />
      </ScreenContent>
    </>
  );
}

function RedeemContent() {
  const [code, setCode] = useState("");
  const [success, setSuccess] = useState<{ durationDays: number; newAccessExpiresAt: Date } | null>(null);
  const redeem = useRedeemCode();
  const router = useRouter();
  const { t } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || redeem.isPending) return;

    setSuccess(null);
    redeem.mutate(code.trim(), {
      onSuccess: (data) => {
        setSuccess({
          durationDays: data.durationDays,
          newAccessExpiresAt: new Date(data.newAccessExpiresAt),
        });
      },
    });
  };

  // ── Success state ──────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="relative mb-6">
          <Sparkles className="absolute -left-4 -top-2 h-4 w-4 text-brand-300" aria-hidden />
          <Sparkles className="absolute -right-3 top-1 h-3 w-3 text-brand-200" aria-hidden />
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
            <CheckCircle2 className="h-10 w-10 text-brand-600" />
          </div>
        </div>

        <h2 className="text-lg font-bold text-slate-900">
          {t("subscription.redeemSuccess")} 🎉
        </h2>
        <p className="mt-2 max-w-xs text-sm text-slate-500">
          {t("subscription.redeemSuccessDesc")}
        </p>

        <div className="mt-6 w-full max-w-xs space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t("subscription.duration")}</span>
            <span className="font-semibold text-slate-900">{success.durationDays} days</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t("subscription.accessUntil")}</span>
            <span className="font-semibold text-slate-900">{formatDate(success.newAccessExpiresAt)}</span>
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

  // ── Input form ────────────────────────────────────────────────
  const errorMessage = redeem.error instanceof ApiError
    ? redeem.error.message
    : redeem.error
      ? "Something went wrong while verifying your code. Please try again."
      : null;

  return (
    <div className="space-y-4">
      {/* Header */}
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

      {/* Form */}
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
          aria-label="Activation code"
        />

        {/* Error message */}
        {errorMessage ? (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-800">{errorMessage}</p>
          </div>
        ) : null}

        {/* Submit button */}
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

      {/* Need a code? WhatsApp CTA */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-sm font-medium text-slate-700">{t("subscription.needCode")}</p>
        <p className="mt-1 text-xs text-slate-500">{t("subscription.contactUsDesc")}</p>
        <a
          href={getWhatsAppLink(getDefaultWhatsAppMessage())}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
        >
          <MessageCircle className="h-5 w-5" />
          {t("subscription.contactUs")}
        </a>
        <p className="mt-1.5 text-xs text-slate-500">{WHATSAPP_NUMBER_DISPLAY}</p>
      </div>
    </div>
  );
}
