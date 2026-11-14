"use client";

/**
 * Register page — name + email + password + plan choice.
 * Trial plan → redirect to /dashboard (starts the 30-day free trial).
 * Paid plan  → redirect to /more/redeem (account is unactivated until a code
 *              is redeemed).
 * Has a link to /login for existing users.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Loader2, AlertCircle } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/providers/toast-provider";
import { useLanguage } from "@/providers/language-provider";
import { resolveApiError } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState<"trial" | "paid">("trial");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      toast.success(t("auth.accountCreated"));
      router.push(plan === "paid" ? "/more/redeem" : "/dashboard");
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