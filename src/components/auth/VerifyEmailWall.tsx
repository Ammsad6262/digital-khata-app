"use client";

/**
 * VerifyEmailWall — shown by AuthGate ONLY when EMAIL_VERIFICATION_ENFORCED
 * is "true" and the signed-in account has not verified its address.
 *
 * It is deliberately small: one explanation, one action, the three paths that
 * must stay reachable (settings, subscription, redeem), and Log out. Nothing
 * else in the app is rendered behind it.
 *
 * With the flag off this component is never mounted, so authentication,
 * subscription and PIN behaviour are unchanged.
 */

import Link from "next/link";
import { MailCheck, LogOut } from "lucide-react";
import { useLanguage } from "@/providers/language-provider";
import { useLogout } from "@/hooks/use-auth";
import { Button } from "@/components/ui/Button";

const STILL_AVAILABLE = [
  { href: "/more/settings", key: "more.settings" },
  { href: "/more/subscription", key: "subscription.title" },
  { href: "/more/redeem", key: "more.redeem" },
] as const;

export function VerifyEmailWall({ email }: { email: string }) {
  const { t, tParams } = useLanguage();
  const logout = useLogout();

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-app p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-2">
          <MailCheck aria-hidden="true" className="h-7 w-7 text-brand-600" strokeWidth={1.75} />
        </div>

        <h1 className="mt-4 text-lg font-bold text-ink">{t("verify.wallTitle")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
          {tParams("verify.wallBody", { email })}
        </p>

        <Link
          href="/verify-email"
          className="focus-ring mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-brand-600 px-4 text-sm font-semibold text-white shadow-brand hover:bg-brand-700"
        >
          {t("verify.wallCta")}
        </Link>

        <div className="mt-5 rounded-card border border-line bg-surface p-3 text-start">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {t("verify.wallAvailable")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {STILL_AVAILABLE.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="focus-ring inline-flex rounded-control border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-surface-3"
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="mt-4 w-full"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          {logout.isPending ? t("auth.loggingOut") : t("auth.logout")}
        </Button>
      </div>
    </div>
  );
}