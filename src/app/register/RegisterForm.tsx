"use client";

/**
 * Register page — name + email + password + plan choice.
 * Trial plan → redirect to /dashboard (starts the 14-day free trial).
 * Paid plan  → redirect to /more/redeem (account is unactivated until a code
 *              is redeemed).
 * Has a link to /login for existing users.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Loader2, AlertCircle, Check } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/providers/toast-provider";
import { useLanguage } from "@/providers/language-provider";
import { resolveApiError } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";

export function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<"trial" | "paid">("trial");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [agreedError, setAgreedError] = useState(false);
  const [shake, setShake] = useState(false);
  const agreeRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !password) {
      setError(t("auth.allFieldsRequired"));
      return;
    }

    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      return;
    }

    if (!agreed) {
      setAgreedError(true);
      setShake(true);
      agreeRef.current?.focus();
      return;
    }

    setIsPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, plan }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(resolveApiError(json.error) || t("auth.registerFailed"));
      }

      // A returning mailbox (account deleted, or another spelling of the same
      // Gmail address) is created without a trial. Tell the owner plainly and
      // send them to the code page rather than to a dashboard they cannot use.
      const trialGranted = json.data?.trialGranted !== false;
      if (trialGranted) {
        toast.success(t("auth.accountCreated"));
      } else {
        toast.error(t("auth.trialAlreadyUsed"));
      }

      // Verification is pending when the account has no emailVerifiedAt.
      // Route to /verify-email only when a code was actually delivered (or
      // enforcement is on) — otherwise a user whose provider is not configured
      // would land on a page with no way to get a code. This keeps the flow
      // honest while the feature ships behind an OFF flag.
      const createdUser = json.data?.user as
        | { id?: string; emailVerifiedAt?: string | null }
        | undefined;
      const verificationPending = createdUser?.emailVerifiedAt == null;
      const codeDelivered = json.data?.verificationSent === true;
      const enforced = json.data?.emailVerificationEnforced === true;

      if (verificationPending && createdUser?.id) {
        try {
          // The verify page reads this to start its 60-second resend countdown
          // without sending a second code.
          sessionStorage.setItem(
            `dk_verify_sent_at:${createdUser.id}`,
            String(Date.now()),
          );
        } catch {
          /* private mode — the page falls back to ?sent=1 */
        }
      }

      if (
        trialGranted &&
        verificationPending &&
        (codeDelivered || enforced)
      ) {
        router.push("/verify-email?sent=1");
      } else {
        router.push(
          trialGranted && plan !== "paid" ? "/dashboard" : "/more/redeem",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.registerFailed"));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AuthLayout
      subtitle={t("auth.createAccountSubtitle")}
      footer={
        <>
          {t("auth.haveAccountQuestion")}{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-600 underline-offset-2 hover:underline"
          >
            {t("auth.login")}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <div className="flex items-center gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger-ink ring-1 ring-danger/15">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <TextField
          label={t("auth.name")}
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("auth.yourNamePlaceholder")}
          autoComplete="name"
          autoFocus
          leftIcon={<User className="h-4 w-4" />}
        />

        <TextField
          label={t("auth.email")}
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
          leftIcon={<Mail className="h-4 w-4" />}
        />

        <TextField
          label={t("auth.password")}
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("auth.passwordMinPlaceholder")}
          autoComplete="new-password"
          leftIcon={<Lock className="h-4 w-4" />}
        />

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">{t("auth.choosePlan")}</p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setPlan("trial")}
              aria-pressed={plan === "trial"}
              className={cn(
                "w-full rounded-control border px-3 py-2.5 text-left transition-colors",
                plan === "trial"
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/25"
                  : "border-line bg-surface hover:bg-app",
              )}
            >
              <span className="block text-sm font-semibold text-ink">
                {t("auth.planTrialTitle")}
              </span>
              <span className="mt-0.5 block text-xs text-ink-subtle">
                {t("auth.planTrialDesc")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPlan("paid")}
              aria-pressed={plan === "paid"}
              className={cn(
                "w-full rounded-control border px-3 py-2.5 text-left transition-colors",
                plan === "paid"
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/25"
                  : "border-line bg-surface hover:bg-app",
              )}
            >
              <span className="block text-sm font-semibold text-ink">
                {t("auth.planPaidTitle")}
              </span>
              <span className="mt-0.5 block text-xs text-ink-subtle">
                {t("auth.planPaidDesc")}
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="agree-terms"
            onAnimationEnd={() => setShake(false)}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-control border bg-surface p-3 transition-colors",
              "focus-within:ring-2 focus-within:ring-brand-500/40 focus-within:ring-offset-2 focus-within:ring-offset-app",
              agreedError ? "border-danger" : "border-line",
              shake && "animate-shake",
            )}
          >
            <input
              ref={agreeRef}
              id="agree-terms"
              name="agreeTerms"
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setAgreedError(false);
              }}
              aria-invalid={agreedError}
              aria-describedby={agreedError ? "agree-terms-error" : undefined}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border",
                "transition-colors duration-150 ease-out",
                agreed
                  ? "border-brand-600 bg-brand-600 text-white"
                  : cn("bg-surface", agreedError ? "border-danger" : "border-line-strong"),
              )}
            >
              <Check
                className={cn(
                  "h-3 w-3 transition-transform duration-200 ease-out",
                  agreed ? "scale-100" : "scale-0",
                )}
                strokeWidth={3}
              />
            </span>
            <span className="text-[13px] font-medium leading-snug text-ink-muted">
              {t("auth.agreePrefix")}{" "}
              <Link
                href="/terms"
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                {t("legal.termsLink")}
              </Link>{" "}
              {t("auth.agreeAnd")}{" "}
              <Link
                href="/privacy"
                className="text-brand-600 underline-offset-2 hover:underline"
              >
                {t("legal.privacyLink")}
              </Link>
              {t("auth.agreeSuffix")}
            </span>
          </label>
          {agreedError ? (
            <p
              id="agree-terms-error"
              role="alert"
              className="text-xs font-medium text-danger"
            >
              {t("auth.agreeRequired")}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("auth.creatingAccount")}
            </>
          ) : plan === "paid" ? (
            t("auth.createAndRedeem")
          ) : (
            t("auth.signUp")
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}