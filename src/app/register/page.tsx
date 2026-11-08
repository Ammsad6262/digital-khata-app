"use client";

/**
 * Register page — name + email + password.
 * On success → redirect to /dashboard.
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

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !password) {
      setError(t("auth.allFieldsRequired"));
      return;
    }

    if (password.length < 6) {
      setError(t("auth.passwordTooShort"));
      return;
    }

    setIsPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || t("auth.registerFailed"));
      }

      toast.success(t("auth.accountCreated"));
      router.push("/dashboard");
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
          ) : (
            t("auth.signUp")
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}