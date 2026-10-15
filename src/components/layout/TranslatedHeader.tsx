"use client";

/**
 * TranslatedHeader — a client-side header wrapper that uses a translation
 * key for the title. Used by server-rendered pages (e.g. /more/expenses/[id])
 * that need translated headers but can't call useLanguage() themselves.
 *
 * Replaces the previous pattern of <AppHeader title="Hardcoded English" />
 * with <TranslatedHeader titleKey="expense.expenseDetail" />.
 *
 * Supports:
 *   - Title from translation key (translated to user's language)
 *   - Optional rightSlot (any React node — for back buttons, actions)
 *   - Optional backHref (renders a back arrow that flips in RTL)
 */

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/providers/language-provider";
import { cn } from "@/lib/utils/cn";
import type { TranslationKey } from "@/lib/i18n/translations";

export function TranslatedHeader({
  titleKey,
  backHref,
  rightSlot,
  className,
}: {
  titleKey: TranslationKey;
  backHref?: string;
  rightSlot?: React.ReactNode;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {backHref ? (
          <Link
            href={backHref}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5 rtl-flip" />
          </Link>
        ) : null}
        <h1 className="truncate text-base font-semibold text-slate-900">
          {t(titleKey)}
        </h1>
      </div>
      {rightSlot ? <div className="flex items-center gap-2">{rightSlot}</div> : null}
    </header>
  );
}
