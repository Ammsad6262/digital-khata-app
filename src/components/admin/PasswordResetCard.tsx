"use client";

/**
 * Admin card for issuing a one-time password-reset code.
 *
 * The code is displayed once and never stored in plaintext. The admin shares
 * it privately with the user; the reset page asks for the email + code + new
 * password. No email provider is required.
 */

import { useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
} from "lucide-react";
import { useLanguage } from "@/providers/language-provider";

type IssuedCode = {
  code: string;
  expiresAt: string;
  user: { id: string; name: string; email: string };
};

export function PasswordResetCard({ adminSecret }: { adminSecret: string }) {
  const { t, tParams } = useLanguage();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<IssuedCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "message" | null>(null);

  const generate = async () => {
    if (!email.trim()) {
      setError(t("admin.userEmailRequired"));
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/password-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || t("admin.failed"));
      }
      setResult(json.data as IssuedCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.failedConnect"));
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string, kind: "code" | "message") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError(t("admin.copyFailed"));
    }
  };

  const copyMessage = () => {
    if (!result) return;
    const link = `${window.location.origin}/reset-password?email=${encodeURIComponent(
      result.user.email,
    )}`;
    const message = tParams("admin.resetMessage", {
      code: result.code,
      link,
      minutes: 30,
    });
    void copy(message, "message");
  };

  const resetHref = result
    ? `/reset-password?email=${encodeURIComponent(result.user.email)}`
    : "/reset-password";
  const expiry = result
    ? new Date(result.expiresAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("admin.passwordResetTitle")}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {t("admin.passwordResetSubtitle")}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <label
          htmlFor="admin-reset-email"
          className="mb-1 block text-xs text-slate-500"
        >
          {t("admin.userEmail")}
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="admin-reset-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            autoComplete="email"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading || !email.trim()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          {t("admin.generateResetCode")}
        </button>
        {error ? (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 p-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-xs text-red-800">{error}</p>
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-medium text-brand-900">
            {tParams("admin.resetCodeFor", {
              name: result.user.name,
              email: result.user.email,
            })}
          </p>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-2.5">
            <code className="flex-1 font-mono text-sm font-bold tracking-wider text-slate-900">
              {result.code}
            </code>
            <button
              type="button"
              onClick={() => void copy(result.code, "code")}
              aria-label={t("admin.copyCode")}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              {copied === "code" ? (
                <Check className="h-4 w-4 text-brand-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-brand-800">
            {tParams("admin.resetCodeExpires", { time: expiry })}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <a
              href={resetHref}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-300 bg-white px-2 py-2 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("admin.openResetPage")}
            </a>
            <button
              type="button"
              onClick={copyMessage}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-brand-300 bg-white px-2 py-2 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
            >
              {copied === "message" ? (
                <Check className="h-3.5 w-3.5 text-brand-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {t("admin.copyResetMessage")}
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-brand-700">
            {t("admin.resetCodeOnce")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
