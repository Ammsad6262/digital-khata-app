"use client";

/**
 * Login page — email + password.
 * On success → redirect to /dashboard.
 * Has a link to /register for new users.
 *
 * V13: Wired into i18n — all visible text uses t().
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Loader2, AlertCircle } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/providers/toast-provider";
import { useLanguage } from "@/providers/language-provider";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError(t("auth.emailPasswordRequired"));
      return;
    }

    setIsPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || t("auth.loginFailed"));
      }

      toast.success(t("auth.welcomeBack"));
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("auth.loginFailed"));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AuthLayout
      subtitle={t("auth.loginSubtitle")}
      footer={
        <>
          {t("auth.noAccountQuestion")}{" "}
          <Link
            href="/register"
            className="font-semibold text-brand-600 underline-offset-2 hover:underline"
          >
            {t("auth.signUp")}
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
          label={t("auth.email")}
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
          autoFocus
          leftIcon={<Mail className="h-4 w-4" />}
        />

        <TextField
          label={t("auth.password")}
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          leftIcon={<Lock className="h-4 w-4" />}
        />

        <div className="-mt-1 flex justify-end">
          <Link
            href="/reset-password"
            className="text-[12px] font-semibold text-brand-600 underline-offset-2 hover:underline"
          >
            {t("auth.forgotPassword")}
          </Link>
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
              {t("auth.loggingIn")}
            </>
          ) : (
            t("auth.login")
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}