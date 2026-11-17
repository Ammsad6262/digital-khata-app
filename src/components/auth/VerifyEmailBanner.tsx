"use client";

/**
 * VerifyEmailBanner — the voluntary, flag-OFF path.
 *
 * Shown to signed-in, unverified accounts while EMAIL_VERIFICATION_ENFORCED is
 * false, so owners can confirm their address on their own terms.
 *
 * Non-obstructive by construction:
 *   - it is an in-flow strip above the app shell (never fixed, never overlaying
 *     the header, the bottom dock, a form's save bar, or a receipt),
 *   - it is hidden on the receipt route,
 *   - dismissing it is remembered for the browser session.
 */

import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";
import { useLanguage } from "@/providers/language-provider";

export function VerifyEmailBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useLanguage();

  return (
    <div className="mx-auto w-full max-w-[1040px] px-3 pt-3">
      <div className="flex items-start gap-3 rounded-control border border-line bg-surface px-3 py-2.5 shadow-soft">
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-brand-600"
          strokeWidth={2}
        />
        <p className="flex-1 text-[12px] leading-snug text-ink-muted">
          {t("verify.bannerText")}{" "}
          <Link
            href="/verify-email"
            className="focus-ring rounded font-semibold text-brand-600 underline-offset-2 hover:underline"
          >
            {t("verify.bannerCta")}
          </Link>
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("common.dismiss")}
          className="focus-ring -mt-1 rounded-control p-1 text-ink-faint hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}