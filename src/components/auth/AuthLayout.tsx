"use client";

/**
 * AuthLayout — shared frame for login / register / reset.
 *
 * A calm, warm canvas with a soft brand glow, the app mark, and a single
 * elevated card. Keeps every entry point visually consistent.
 */

import { type ReactNode } from "react";
import { useLanguage } from "@/providers/language-provider";

export function AuthLayout({
  subtitle,
  children,
  footer,
}: {
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useLanguage();

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-5 py-10">
      {/* ambient brand glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 right-0 h-72 w-72 rounded-full bg-accent-500/10 blur-3xl"
      />

      <div className="relative w-full max-w-[22rem] animate-rise-in">
        {/* Brand mark */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3.5 h-16 w-16 overflow-hidden rounded-[1.35rem] shadow-brand ring-1 ring-line">
            <img
              src="/icon.png"
              alt={t("app.name")}
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-[24px] font-extrabold tracking-[-0.035em] text-ink">
            {t("app.name")}
          </h1>
          <p className="mt-1 text-[13px] text-ink-subtle">{subtitle}</p>
        </div>

        {/* Card */}
        <div className="rounded-[1.5rem] border border-line bg-surface p-5 shadow-lift">
          {children}
        </div>

        {footer ? (
          <div className="mt-5 text-center text-[13px] text-ink-subtle">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}