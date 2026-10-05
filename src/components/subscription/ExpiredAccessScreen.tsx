"use client";

/**
 * ExpiredAccessScreen — shown when the user's trial/subscription has expired.
 *
 * Shows:
 *   1. Lock/crown icon
 *   2. "Your free trial has ended" heading
 *   3. Reassurance: "Your business data remains safely stored."
 *   4. WhatsApp button (923183494917)
 *   5. Redeem Code button → /more/redeem
 *
 * Settings, Account, and Subscription remain accessible — the user is NOT
 * locked out of their account. They just can't use premium features until
 * they redeem a code.
 */

import Link from "next/link";
import { Lock, MessageCircle, KeyRound, Sparkles } from "lucide-react";
import { getWhatsAppLink, getDefaultWhatsAppMessage, WHATSAPP_NUMBER_DISPLAY } from "@/lib/utils/whatsapp";
import { useLanguage } from "@/providers/language-provider";

export function ExpiredAccessScreen() {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Icon */}
        <div className="relative mx-auto w-fit">
          <Sparkles className="absolute -left-4 -top-2 h-4 w-4 text-brand-300" aria-hidden />
          <Sparkles className="absolute -right-3 top-1 h-3 w-3 text-brand-200" aria-hidden />
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100">
            <Lock className="h-9 w-9 text-slate-500" strokeWidth={1.75} />
          </div>
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {t("subscription.trialEnded")}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("subscription.afterTrialDesc")}
          </p>
          <p className="mt-1 text-sm font-medium text-brand-600">
            {t("subscription.dataSafe")}
          </p>
        </div>

        {/* WhatsApp button */}
        <a
          href={getWhatsAppLink(getDefaultWhatsAppMessage())}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
        >
          <MessageCircle className="h-5 w-5" />
          {t("subscription.contactUs")}
        </a>
        <p className="text-xs text-slate-500">{WHATSAPP_NUMBER_DISPLAY}</p>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">{t("subscription.alreadyHaveCode")}</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Redeem code button */}
        <Link
          href="/more/redeem"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
        >
          <KeyRound className="h-5 w-5" />
          {t("subscription.enterCode")}
        </Link>

        <p className="text-xs text-slate-400">
          {t("subscription.enterActivationCode")}
        </p>
      </div>
    </div>
  );
}
