"use client";

/**
 * EmailConfirmDialog — step-up confirmation for a destructive action.
 *
 * Why this shape: the owner said "make it smooth and easy, no bugs". So it is a
 * single 6-digit field, not six boxes:
 *
 *   - six boxes need focus-juggling and break on paste, backspace and RTL;
 *   - one field gets `autoComplete="one-time-code"`, so iOS/Android offers the
 *     code from the inbox in one tap;
 *   - the code is normalised server-side too, so spaces or a pasted
 *     "123 456" still work.
 *
 * The dialog owns the whole flow — requesting the code, the 60-second resend
 * countdown, and showing the server's own error message ("code expired", "wrong
 * code") — so every caller behaves identically.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, MailCheck, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ApiError } from "@/lib/utils/api-client";
import { useLanguage } from "@/providers/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { ConfirmableAction } from "@/lib/account/action-confirmation";

const RESEND_SECONDS = 60;

type ConfirmCopy = {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
};

const COPY: Record<ConfirmableAction, ConfirmCopy> = {
  delete_account: { titleKey: "confirm.deleteAccount.title", bodyKey: "confirm.deleteAccount.body" },
  change_password: { titleKey: "confirm.changePassword.title", bodyKey: "confirm.changePassword.body" },
  clear_data: { titleKey: "confirm.clearData.title", bodyKey: "confirm.clearData.body" },
  export_data: { titleKey: "confirm.exportData.title", bodyKey: "confirm.exportData.body" },
  reset_pin: { titleKey: "confirm.resetPin.title", bodyKey: "confirm.resetPin.body" },
};

export type EmailConfirmSubmit = { confirmToken: string; confirmCode: string };

export function EmailConfirmDialog({
  open,
  action,
  busy = false,
  serverError,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  action: ConfirmableAction;
  /** True while the guarded action itself is running. */
  busy?: boolean;
  /** Error returned by the guarded action, shown under the field. */
  serverError?: string | null;
  onCancel: () => void;
  onConfirm: (input: EmailConfirmSubmit) => void;
}) {
  const { t } = useLanguage();
  const copy = COPY[action];

  const [token, setToken] = useState<string>("");
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestedFor = useRef<string | null>(null);

  const request = useCallback(async () => {
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/account/action-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          json?.error?.message ?? json?.error?.code ?? t("confirm.sendFailed");
        throw new ApiError(String(message), json?.error?.code ?? "SEND_FAILED", res.status);
      }
      const data = json?.data ?? {};
      setToken(String(data.token ?? ""));
      setMaskedEmail(String(data.email ?? ""));
      setCode("");
      setCooldown(RESEND_SECONDS);
      // The field is the only thing left to do, so send focus there.
      window.setTimeout(() => inputRef.current?.focus(), 60);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : t("confirm.sendFailed"));
    } finally {
      setSending(false);
    }
  }, [action, t]);

  // Request a code once per opening (not on every render).
  useEffect(() => {
    if (!open) {
      requestedFor.current = null;
      setCode("");
      setToken("");
      setSendError(null);
      setCooldown(0);
      return;
    }
    if (requestedFor.current === action) return;
    requestedFor.current = action;
    void request();
  }, [open, action, request]);

  // Resend countdown.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  if (!open) return null;

  const digits = code.replace(/\D/g, "").slice(0, 6);
  const ready = digits.length === 6 && token.length > 0 && !sending;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-confirm-title"
        className="w-full max-w-sm animate-rise-in rounded-[1.25rem] border border-line bg-surface p-5 shadow-lift"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand/10">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <h2 id="email-confirm-title" className="text-[15px] font-bold tracking-[-0.02em] text-ink">
              {t(copy.titleKey)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label={t("common.cancel")}
            className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">{t(copy.bodyKey)}</p>

        {sending ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-app px-3 py-3 text-[13px] text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("confirm.sending")}
          </div>
        ) : sendError ? (
          <div className="mt-4 rounded-xl border border-danger/25 bg-danger-soft px-3 py-3 text-[13px] text-danger-ink">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{sendError}</span>
            </div>
            <button
              type="button"
              onClick={() => void request()}
              className="mt-2 text-[12px] font-semibold text-brand-700 underline"
            >
              {t("confirm.tryAgain")}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-[12.5px] text-success-ink">
              <MailCheck className="h-4 w-4 shrink-0" />
              <span>
                {t("confirm.sentTo")} <strong className="font-semibold">{maskedEmail}</strong>
              </span>
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-[11px] font-medium text-ink-subtle">
                {t("confirm.codeLabel")}
              </span>
              <input
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && ready && !busy) {
                    onConfirm({ confirmToken: token, confirmCode: digits });
                  }
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                aria-describedby="email-confirm-hint"
                className={cn(
                  "w-full rounded-xl border bg-surface px-3 py-3 text-center text-[22px] font-semibold",
                  "tracking-[0.5em] tabular-nums text-ink placeholder:tracking-[0.5em] placeholder:text-ink-faint",
                  "focus:outline-none focus:ring-2",
                  serverError
                    ? "border-danger/40 focus:border-danger focus:ring-danger/30"
                    : "border-line-strong focus:border-brand-500 focus:ring-brand-500/30",
                )}
              />
            </label>

            <div className="mt-1.5 flex items-center justify-between">
              <p id="email-confirm-hint" className="text-[11px] text-ink-subtle">
                {t("confirm.expires")}
              </p>
              {cooldown > 0 ? (
                <p className="text-[11px] text-ink-faint">
                  {t("confirm.resendIn")} {cooldown}s
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void request()}
                  className="text-[11px] font-semibold text-brand-700 underline"
                >
                  {t("confirm.resend")}
                </button>
              )}
            </div>

            {serverError ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger-ink">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {serverError}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-line-strong py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ confirmToken: token, confirmCode: digits })}
            disabled={!ready || busy}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold text-white transition-colors",
              "bg-brand-600 hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300",
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? t("confirm.working") : t("confirm.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}