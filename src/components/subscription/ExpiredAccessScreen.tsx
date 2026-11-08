"use client";
import Link from "next/link";
import { Lock, MessageCircle, KeyRound } from "lucide-react";
import { getWhatsAppLink, getDefaultWhatsAppMessage, WHATSAPP_NUMBER_DISPLAY } from "@/lib/utils/whatsapp";
import { useLanguage } from "@/providers/language-provider";

export function ExpiredAccessScreen() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-app p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="relative mx-auto w-fit">
         
         
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-2">
            <Lock className="h-9 w-9 text-ink-subtle" strokeWidth={1.75} />
          </div>
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink">{t("subscription.trialEnded")}</h1>
          <p className="mt-2 text-sm text-ink-subtle">{t("subscription.afterTrialDesc")}</p>
          <p className="mt-1 text-sm font-medium text-brand-600">{t("subscription.dataSafe")}</p>
        </div>
        <a href={getWhatsAppLink(getDefaultWhatsAppMessage())} target="_blank" rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 text-sm font-semibold text-white shadow-card transition-transform hover:scale-[1.02] active:scale-95">
          <MessageCircle className="h-5 w-5" />{t("subscription.contactUs")}
        </a>
        <p className="text-xs text-ink-subtle">{WHATSAPP_NUMBER_DISPLAY}</p>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-surface-2" />
          <span className="text-xs text-ink-faint">{t("subscription.alreadyHaveCode")}</span>
          <div className="h-px flex-1 bg-surface-2" />
        </div>
        <Link href="/more/redeem" className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white shadow-card transition-transform hover:scale-[1.02] active:scale-95">
          <KeyRound className="h-5 w-5" />{t("subscription.enterCode")}
        </Link>
        <p className="text-xs text-ink-faint">{t("subscription.enterActivationCode")}</p>
      </div>
    </div>
  );
}
