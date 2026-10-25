"use client";

/**
 * Public password-reset form.
 *
 * The user gets a one-time code from the admin (shown once on the admin page),
 * then sets a new password here. No email provider is involved, so the flow
 * works fully inside the app.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { useLanguage } from "@/providers/language-provider";

export function ResetPasswordForm({ initialEmail = "" }: { initialEmail?: string }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !code.trim() || !newPassword || !confirmPassword) {
      setError(t("reset.allFieldsRequired"));
      return;
    }
    if (newPassword.length < 6) {
      setError(t("auth.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("reset.passwordMismatch"));
      return;
    }

    setIsPending(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || t("reset.failed"));
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("reset.failed"));
    } finally {
      setIsPending(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
            <CheckCircle2 className="h-9 w-9 text-brand-700" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">{t("reset.successTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{t("reset.successBody")}</p>
          <Link
            href="/login"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700"
          >
            <ArrowLeft className="h-4 w-4 rtl-flip" />
            {t("reset.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img
            src="/icon.png"
            alt={t("app.name")}
            className="mx-auto mb-3 h-14 w-14 rounded-2xl shadow-lg"
          />
          <h1 className="text-xl font-bold text-slate-900">{t("reset.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("reset.subtitle")}</p>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-xs leading-relaxed text-amber-900">{t("reset.adminHint")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div>
            <label
              htmlFor="reset-email"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              {t("auth.email")}
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                autoComplete="email"
                autoFocus={!initialEmail}
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="reset-code"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              {t("reset.code")}
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="reset-code"
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="ABCD-EFGH-JKLM"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus={!!initialEmail}
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 font-mono text-sm tracking-wider text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{t("reset.codeHint")}</p>
          </div>

          <div>
            <label
              htmlFor="reset-new-password"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              {t("reset.newPassword")}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="reset-new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={t("auth.passwordMinPlaceholder")}
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="reset-confirm-password"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              {t("reset.confirmPassword")}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={t("reset.confirmPassword")}
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/20 transition-colors hover:bg-brand-700 disabled:bg-brand-300"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("reset.submitting")}
              </>
            ) : (
              t("reset.submit")
            )}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4 rtl-flip" />
          {t("reset.backToLogin")}
        </Link>
      </div>
    </div>
  );
}
