"use client";

/**
 * VerifyEmailForm — the 6-digit email verification screen.
 *
 * Behaviour:
 *   - Six single-character boxes, numeric keyboard, one-time-code autofill on
 *     the first box, per-box aria-labels.
 *   - Typing advances; backspace clears and steps back; arrow keys move;
 *     pasting a full code fills every box; the form auto-submits once all six
 *     digits are present (the explicit button remains for keyboard/AT users).
 *   - Resend has a live 60-second countdown (read from sessionStorage so a
 *     refresh does not reset it) and is disabled while counting.
 *   - Failures are announced with role="alert", mark every box aria-invalid,
 *     and move focus back to the first box.
 *   - Already-verified accounts are sent on to /dashboard on mount.
 *
 * The digit row is explicitly LTR: a verification code reads in numeric order
 * in every language, even when the rest of the page is Urdu/RTL.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/providers/toast-provider";
import { useLanguage } from "@/providers/language-provider";
import { translateKey } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";

const CODE_LENGTH = 6;
const COOLDOWN_SECONDS = 60;
const SENT_AT_PREFIX = "dk_verify_sent_at:";

type ErrorState = { key: string; params?: Record<string, string | number> };

type MeResponse = {
  ok?: boolean;
  data?: {
    user?: {
      id: string;
      email: string;
      emailVerifiedAt?: string | null;
    } | null;
  };
};

type SendResponse = {
  ok?: boolean;
  cooldownSeconds?: number;
  sent?: boolean;
  error?: {
    messageKey?: string;
    params?: Record<string, string | number>;
    retryAfter?: number;
  };
};

type ConfirmResponse = {
  ok?: boolean;
  verified?: boolean;
  error?: { messageKey?: string };
};

function readSentAt(userId: string): number | null {
  try {
    const raw = sessionStorage.getItem(SENT_AT_PREFIX + userId);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeSentAt(userId: string): void {
  try {
    sessionStorage.setItem(SENT_AT_PREFIX + userId, String(Date.now()));
  } catch {
    /* private mode — the countdown just resets on refresh */
  }
}

/** Digits only, ASCII (local Urdu numerals are mapped by the server too). */
function digitsOnly(input: string): string {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const urdu = "۰۱۲۳۴۵۶۷۸۹";
  let out = "";
  for (const char of input) {
    const a = arabic.indexOf(char);
    if (a >= 0) {
      out += String(a);
      continue;
    }
    const u = urdu.indexOf(char);
    if (u >= 0) {
      out += String(u);
      continue;
    }
    if (char >= "0" && char <= "9") out += char;
  }
  return out;
}

export function VerifyEmailForm() {
  const router = useRouter();
  const toast = useToast();
  const { t, tParams, lang } = useLanguage();

  const [email, setEmail] = useState("");
  const [booting, setBooting] = useState(true);
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [notDelivered, setNotDelivered] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const autoSentRef = useRef(false);
  const sendingRef = useRef(false);
  const submittingRef = useRef(false);
  const lastSubmittedRef = useRef<string | null>(null);
  const verifiedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  const code = digits.join("");
  const complete = code.length === CODE_LENGTH;
  const errorMessage = error ? translateKey(error.key, lang, error.params) : null;

  const focusBox = useCallback((index: number) => {
    window.requestAnimationFrame(() => {
      const target = inputsRef.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))];
      target?.focus();
      target?.select();
    });
  }, []);

  const resetDigits = useCallback(() => {
    setDigits(Array(CODE_LENGTH).fill(""));
    lastSubmittedRef.current = null;
    focusBox(0);
  }, [focusBox]);

  const startCooldown = useCallback((seconds: number) => {
    const safe = Math.max(1, Math.round(seconds));
    setCooldownUntil(Date.now() + safe * 1000);
    setRemaining(safe);
  }, []);

  // ── Live countdown ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldownUntil <= 0) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) setCooldownUntil(0);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  // ── Send / resend a code ───────────────────────────────────────────────────
  const sendCode = useCallback(
    async (options?: { silent?: boolean }) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setNotDelivered(false);
      if (!options?.silent) setError(null);

      try {
        const res = await fetch("/api/auth/verify/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as SendResponse | null;

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        if (!res.ok || !json?.ok) {
          const retryAfter = Number(
            json?.error?.retryAfter ?? json?.error?.params?.seconds ?? 0,
          );
          if (res.status === 429 && retryAfter > 0) {
            startCooldown(retryAfter);
            // The countdown itself explains a cooldown. Only surface the
            // message when the user explicitly pressed the button.
            if (!options?.silent) {
              setError({ key: json?.error?.messageKey ?? "api.verify.cooldown", params: json?.error?.params });
            }
            return;
          }
          setError({
            key: json?.error?.messageKey ?? "api.verify.rateLimited",
            params: json?.error?.params,
          });
          return;
        }

        const cooldown = Number(json.cooldownSeconds) || COOLDOWN_SECONDS;
        startCooldown(cooldown);
        if (userIdRef.current) writeSentAt(userIdRef.current);
        if (json.sent === false) setNotDelivered(true);
        if (!options?.silent) {
          toast.success("verify.resendSent");
          resetDigits();
        }
      } catch {
        setError({ key: "verify.networkError" });
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [resetDigits, router, startCooldown, toast],
  );

  // ── Boot: who is asking, and are they already verified? ────────────────────
  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as MeResponse | null;
        const user = json?.data?.user;

        if (!alive) return;
        if (!res.ok || !json?.ok || !user) {
          router.replace("/login");
          return;
        }
        if (user.emailVerifiedAt) {
          router.replace("/dashboard");
          return;
        }

        userIdRef.current = user.id;
        setEmail(user.email);
        setBooting(false);

        const sentAt = readSentAt(user.id);
        const left = sentAt
          ? Math.ceil((sentAt + COOLDOWN_SECONDS * 1000 - Date.now()) / 1000)
          : 0;
        const justSent =
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("sent") === "1";

        if (left > 0) {
          startCooldown(left);
        } else if (justSent) {
          // The register route just sent one; honour its cooldown even if
          // sessionStorage was unavailable.
          startCooldown(COOLDOWN_SECONDS);
        } else if (!autoSentRef.current) {
          // Arrived from the wall with no code in flight — send the first one.
          autoSentRef.current = true;
          void sendCode({ silent: true });
        }
      } catch {
        if (!alive) return;
        setError({ key: "verify.networkError" });
        setBooting(false);
      }
    }

    void boot();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ── Confirm ────────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (submittedCode: string) => {
      if (submittingRef.current || verifiedRef.current) return;
      if (submittedCode.length !== CODE_LENGTH) return;
      if (lastSubmittedRef.current === submittedCode) return;

      lastSubmittedRef.current = submittedCode;
      submittingRef.current = true;
      setChecking(true);
      setError(null);

      try {
        const res = await fetch("/api/auth/verify/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: submittedCode }),
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as ConfirmResponse | null;

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        if (res.ok && json?.ok) {
          verifiedRef.current = true;
          toast.success("verify.verified");
          // AuthGate is mounted above this page and cached the user; tell it
          // the address is now verified so it does not show the wall again.
          window.dispatchEvent(new Event("dk:email-verified"));
          router.push("/dashboard");
          return;
        }

        setError({ key: json?.error?.messageKey ?? "api.verify.invalidCode" });
        resetDigits();
      } catch {
        setError({ key: "verify.networkError" });
        resetDigits();
      } finally {
        submittingRef.current = false;
        setChecking(false);
      }
    },
    [resetDigits, router, toast],
  );

  // Auto-submit when all six boxes are filled.
  useEffect(() => {
    if (!complete || booting || checking) return;
    if (lastSubmittedRef.current === code) return;
    void submit(code);
  }, [booting, complete, checking, code, submit]);

  // Keep focus on the first box whenever an error appears.
  useEffect(() => {
    if (!error) return;
    focusBox(0);
  }, [error, focusBox]);

  // ── Box handlers ───────────────────────────────────────────────────────────
  const setDigitAt = (index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const distribute = (start: number, raw: string) => {
    const clean = digitsOnly(raw).slice(0, CODE_LENGTH);
    if (!clean) return;
    const chars = clean.split("");
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((char, offset) => {
        if (start + offset < CODE_LENGTH) next[start + offset] = char;
      });
      return next;
    });
    lastSubmittedRef.current = null;
    focusBox(Math.min(start + chars.length, CODE_LENGTH - 1));
  };

  const handleChange = (index: number, raw: string) => {
    const clean = digitsOnly(raw);
    setError(null);
    if (!clean) {
      setDigitAt(index, "");
      return;
    }
    if (clean.length >= CODE_LENGTH) {
      distribute(0, clean);
      return;
    }
    if (clean.length > 1) {
      // Autofill that landed in a single box: spread it from here.
      distribute(index, clean);
      return;
    }
    setDigitAt(index, clean);
    lastSubmittedRef.current = null;
    if (index < CODE_LENGTH - 1) focusBox(index + 1);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        setDigitAt(index, "");
        lastSubmittedRef.current = null;
        return;
      }
      if (index > 0) {
        setDigitAt(index - 1, "");
        lastSubmittedRef.current = null;
        focusBox(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      setDigitAt(index, "");
      lastSubmittedRef.current = null;
    }
  };

  const handlePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    const clean = digitsOnly(text);
    if (!clean) return;
    event.preventDefault();
    setError(null);
    // A full code always fills from the first box, wherever it was pasted.
    if (clean.length >= CODE_LENGTH) distribute(0, clean);
    else distribute(index, clean);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (complete) void submit(code);
  };

  return (
    <AuthLayout
      subtitle={t("verify.subtitle")}
      footer={
        <Link
          href="/login"
          className="focus-ring rounded-control font-semibold text-brand-600 underline-offset-2 hover:underline"
        >
          {t("verify.useDifferentAccount")}
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink">
            {t("verify.title")}
          </h2>
          {booting ? (
            <p className="text-[13px] text-ink-subtle">{t("common.loading")}</p>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink-subtle">
              {email ? tParams("verify.sentTo", { email }) : t("verify.spamHint")}
            </p>
          )}
        </div>

        <p id="verify-code-label" className="text-[13px] font-medium text-ink-muted">
          {t("verify.enterCode")}
        </p>

        <div
          role="group"
          aria-labelledby="verify-code-label"
          dir="ltr"
          className="grid grid-cols-6 gap-1.5"
        >
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputsRef.current[index] = element;
              }}
              type="text"
              value={digit}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={(event) => handlePaste(index, event)}
              onFocus={(event) => event.currentTarget.select()}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-label={tParams("verify.digitLabel", {
                index: index + 1,
                total: CODE_LENGTH,
              })}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? "verify-error" : undefined}
              disabled={booting || checking}
              className={cn(
                "focus-ring h-12 w-full rounded-control border bg-surface text-center text-lg font-semibold text-ink tabular-nums",
                "transition-colors duration-150 disabled:bg-surface-2 disabled:text-ink-subtle",
                errorMessage
                  ? "border-danger/60"
                  : "border-line-strong hover:border-brand-300 focus:border-brand-500",
              )}
            />
          ))}
        </div>

        {errorMessage ? (
          <div
            id="verify-error"
            role="alert"
            className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger-ink ring-1 ring-danger/15"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {notDelivered && !errorMessage ? (
          <p
            role="status"
            className="rounded-control bg-warning-soft px-3 py-2.5 text-[13px] font-medium text-warning-ink ring-1 ring-warning/15"
          >
            {t("verify.notDelivered")}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={!complete || checking || booting}>
          {checking ? (
            <>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              {t("verify.verifying")}
            </>
          ) : (
            t("verify.submit")
          )}
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-ink-faint">{t("verify.spamHint")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void sendCode()}
            disabled={sending || remaining > 0 || booting}
          >
            {sending
              ? t("verify.sending")
              : remaining > 0
                ? tParams("verify.resendIn", { seconds: remaining })
                : t("verify.resend")}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}