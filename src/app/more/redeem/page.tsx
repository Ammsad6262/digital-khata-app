"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, Loader2, CheckCircle2, MessageCircle, AlertCircle } from "lucide-react";
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
      <div className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-3"><h1 className="text-base font-semibold text-ink">{t("subscription.redeemCode")}</h1></div>
      <main className="flex-1 px-4 pb-24 pt-4 min-h-[calc(100dvh-4rem)]"><RedeemContent /></main>
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
    redeem.mutate(code.trim(), { onSuccess: (data) => { setSuccess({ durationDays: data.durationDays, newAccessExpiresAt: new Date(data.newAccessExpiresAt) }); } });
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="relative mb-6"><div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50"><CheckCircle2 className="h-10 w-10 text-brand-600" /></div></div>
        <h2 className="text-lg font-bold text-ink">{t("subscription.redeemSuccess")} 🎉</h2>
        <p className="mt-2 max-w-xs text-sm text-ink-subtle">{t("subscription.redeemSuccessDesc")}</p>
        <div className="mt-6 w-full max-w-xs space-y-2 rounded-card border border-line bg-surface shadow-card p-4 text-left">
          <div className="flex items-center justify-between text-sm"><span className="text-ink-subtle">{t("subscription.duration")}</span><span className="font-semibold text-ink">{success.durationDays} days</span></div>
          <div className="flex items-center justify-between text-sm"><span className="text-ink-subtle">{t("subscription.accessUntil")}</span><span className="font-semibold text-ink">{formatDate(success.newAccessExpiresAt)}</span></div>
        </div>
        <Button onClick={() => router.push("/dashboard")} className="mt-6 w-full max-w-xs" size="lg">{t("subscription.continue")}</Button>
      </div>
    );
  }

  const errorMessage = redeem.error instanceof ApiError ? redeem.error.message : redeem.error ? "Something went wrong while verifying your code. Please try again." : null;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50"><KeyRound className="h-8 w-8 text-brand-600" /></div>
        <h2 className="text-base font-semibold text-ink">{t("subscription.redeemTitle")}</h2>
        <p className="mt-1 text-sm text-ink-subtle">{t("subscription.redeemDesc")}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("subscription.codePlaceholder")} className="w-full rounded-card border border-line-strong bg-surface py-3.5 text-center text-lg font-mono font-semibold tracking-wider text-ink placeholder:text-ink-faint placeholder:font-sans placeholder:text-sm placeholder:tracking-normal focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" autoComplete="off" autoCapitalize="characters" spellCheck={false} dir="ltr" disabled={redeem.isPending} aria-label="Activation code" />
        {errorMessage ? (<div className="flex items-start gap-2 rounded-lg bg-danger-soft p-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-ink" /><p className="text-sm text-danger-ink">{errorMessage}</p></div>) : null}
        <button type="submit" disabled={!code.trim() || redeem.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-semibold text-white shadow-card transition-transform hover:scale-[1.01] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
          {redeem.isPending ? (<><Loader2 className="h-5 w-5 animate-spin" />{t("subscription.redeeming")}</>) : (<><KeyRound className="h-5 w-5" />{t("subscription.redeemCode")}</>)}
        </button>
      </form>
      <div className="rounded-card border border-line bg-app p-4 text-center">
        <p className="text-sm font-medium text-ink-muted">{t("subscription.needCode")}</p>
        <p className="mt-1 text-xs text-ink-subtle">{t("subscription.contactUsDesc")}</p>
        <a href={getWhatsAppLink(getDefaultWhatsAppMessage())} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-card transition-transform hover:scale-[1.02] active:scale-95"><MessageCircle className="h-5 w-5" />{t("subscription.contactUs")}</a>
        <p className="mt-1.5 text-xs text-ink-subtle">{WHATSAPP_NUMBER_DISPLAY}</p>
      </div>
    </div>
  );
}
