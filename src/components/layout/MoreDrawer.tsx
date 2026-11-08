"use client";

/**
 * MoreDrawer — a slide-out panel from the right that contains all secondary
 * navigation items (formerly the /more page).
 *
 * Why a drawer instead of a route:
 *   - The user spec asks for a polished, modern slide-out panel — not a
 *     basic dropdown of buttons or a dedicated page that requires a route
 *     transition.
 *   - Available on EVERY main page (Dashboard, Khata, Sales, Stock, Expenses)
 *     via the global More button in the top-right of the header.
 *
 * Architecture:
 *   - Portal-rendered to document.body so it escapes any parent stacking
 *     context (sticky headers, modals, etc.) and is always visible.
 *   - Backdrop (semi-transparent, click-to-close).
 *   - Right-side panel that slides in via translateX animation.
 *   - Body scroll lock while open (so the underlying page doesn't scroll
 *     underneath).
 *   - Escape key closes.
 *   - Focus is moved to the drawer on open + restored to the trigger button
 *     on close (basic keyboard accessibility).
 *   - Respects prefers-reduced-motion (animations shortened via globals.css).
 *
 * Layout:
 *   - Mobile (sm): near-full-width panel from the right.
 *   - Tablet (md): 380px panel from the right.
 *   - Desktop (lg): 400px panel from the right (so it feels like an
 *     elegant side panel, not a mobile sheet on a wide screen).
 *
 * Contents — grouped (matches translations.ts more.group* keys):
 *   - Management: Payments, Transactions
 *   - Tools: Backup
 *   - Settings: Subscription, Redeem code, Settings
 *
 *   Note: Khata, Products, and Expenses all have their own primary navigation
 *   entry points (bottom nav for Khata+Expenses, /stock → StockAddMenu for
 *   Products) — so they're removed from More to avoid duplication.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  Wallet,
  ListTree,
  Truck,
  Bell,
  TrendingUp,
  Database,
  Settings as SettingsIcon,
  Crown,
  Gift,
  Sparkles,
  MessageSquare,
  BarChart3,
  HandCoins,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

type MoreItem = {
  href: string;
  titleKey: string;
  descKey: string;
  icon: typeof Wallet;
};

type MoreGroup = {
  titleKey: string;
  items: MoreItem[];
};

// V2 More drawer — Khata, Products, Expenses removed (they have their own
// primary navigation now via the bottom nav or /stock). The remaining items
// are grouped by purpose.
const GROUPS: MoreGroup[] = [
  {
    titleKey: "more.groupManagement",
    items: [
      {
        href: "/payments",
        titleKey: "more.payments",
        descKey: "more.paymentsDesc",
        icon: Wallet,
      },
      {
        href: "/more/transactions",
        titleKey: "more.transactions",
        descKey: "more.transactionsDesc",
        icon: ListTree,
      },
      {
        href: "/more/suppliers",
        titleKey: "more.suppliers",
        descKey: "more.suppliersDesc",
        icon: Truck,
      },
      {
        href: "/more/reminders",
        titleKey: "more.reminders",
        descKey: "more.remindersDesc",
        icon: Bell,
      },
      {
        href: "/more/growth",
        titleKey: "more.growth",
        descKey: "more.growthDesc",
        icon: Sparkles,
      },
      {
        href: "/more/follow-ups",
        titleKey: "more.followUps",
        descKey: "more.followUpsDesc",
        icon: MessageSquare,
      },
      {
        href: "/more/insights",
        titleKey: "more.insights",
        descKey: "more.insightsDesc",
        icon: TrendingUp,
      },
      {
        href: "/more/reports",
        titleKey: "more.reports",
        descKey: "more.reportsDesc",
        icon: BarChart3,
      },
    ],
  },
  {
    titleKey: "more.groupTools",
    items: [
      {
        href: "/more/backup",
        titleKey: "more.backup",
        descKey: "more.backupDesc",
        icon: Database,
      },
      {
        href: "/more/recovery",
        titleKey: "more.recovery",
        descKey: "more.recoveryDesc",
        icon: HandCoins,
      },
      {
        href: "/more/audit",
        titleKey: "more.audit",
        descKey: "more.auditDesc",
        icon: History,
      },
    ],
  },
  {
    titleKey: "more.groupSettings",
    items: [
      {
        href: "/more/subscription",
        titleKey: "subscription.title",
        descKey: "subscription.subtitle",
        icon: Crown,
      },
      {
        href: "/more/redeem",
        titleKey: "more.redeem",
        descKey: "more.redeemDesc",
        icon: Gift,
      },
      {
        href: "/more/settings",
        titleKey: "more.settings",
        descKey: "more.settingsDesc",
        icon: SettingsIcon,
      },
    ],
  },
];

export function MoreDrawer({
  open,
  onClose,
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  // The element that opened the drawer. We restore focus to it on close
  // for keyboard accessibility.
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // ── Mount gate (Portal needs document.body — only available client-side) ──
  useEffect(() => setMounted(true), []);

  // ── Body scroll lock + Escape key handler ──────────────────────────────────
  useEffect(() => {
    if (!open) return;

    // Lock body scroll so the underlying page doesn't scroll behind the drawer
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);

    // Move focus to the drawer (so screen reader users land inside it)
    // Wait one frame so the panel is actually rendered before focusing.
    const timer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);

      // Restore focus to the trigger button when the drawer closes
      // (basic keyboard accessibility — see WAI-ARIA Authoring Practices).
      triggerRef?.current?.focus();
    };
  }, [open, onClose, triggerRef]);

  // ── Close on route change ──────────────────────────────────────────────────
  // If the user clicks a link inside the drawer, Next.js will navigate and
  // pathname will change. We close the drawer so the user lands on the new
  // page with the drawer already gone (no leftover state).
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      // Close the drawer — pathname changed (user clicked a link)
      if (open) onClose();
    }
  }, [pathname, open, onClose]);

  // ── Helper: is a particular item "active" for highlight? ──────────────────
  const isActive = useCallback(
    (href: string) => {
      if (pathname === href) return true;
      // /more/transactions should also be active when its sub-pages are open.
      // But /more itself should NOT be active when /more/products is open
      // (since we removed Products from the drawer — keep it neutral).
      if (href !== "/more" && pathname.startsWith(href)) return true;
      return false;
    },
    [pathname],
  );

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop — click to close. Visible only when open. */}
      {open ? (
        <div
          className="fixed inset-0 z-[200] bg-ink/45 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
          style={{
            animation: "more-drawer-fade-in 0.18s ease-out",
          }}
        />
      ) : null}

      {/* The panel itself. Always rendered in the DOM (so the slide-in
          animation can play), but translateX(100%) hides it when closed.
          The backdrop is conditionally rendered so it doesn't block clicks
          when the drawer is closed. */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.more")}
        className={cn(
          // V7: Content-aware width. On mobile, use max-w-[85vw] so the page
          // behind is partially visible (not full-screen). On tablet/desktop,
          // cap at 380px for an elegant side panel.
          // V13: In RTL, the drawer slides in from the LEFT (handled via
          // CSS rules: right-0 → left-0, translate-x-full → translateX(-100%)).
          "fixed inset-y-0 right-0 z-[210] flex h-full w-[85vw] max-w-[380px] flex-col border-l border-line bg-surface shadow-lift",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Drawer header — sticky at the top with title + close button */}
        <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-control bg-brand-50 text-brand-700">
              <ListTree className="h-4 w-4" />
            </div>
            <h2 className="text-[15px] font-bold tracking-[-0.02em] text-ink">
              {t("nav.more")}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-control p-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Drawer body — grouped navigation items, scrollable */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {GROUPS.map((group, gi) => (
            <section key={group.titleKey} className={cn(gi > 0 && "mt-5")}>
              <p className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                {t(group.titleKey as never)}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors",
                        active
                          ? "bg-brand-50 text-brand-800 ring-1 ring-brand-500/15"
                          : "text-ink-muted hover:bg-surface-2 active:bg-surface-3",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem]",
                          active
                            ? "bg-brand-600 text-white"
                            : "bg-surface-2 text-ink-subtle",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {t(item.titleKey as never)}
                        </p>
                        <p className="truncate text-[11px] text-ink-subtle">
                          {t(item.descKey as never)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Footer — app name + version (subtle) */}
        <footer className="shrink-0 border-t border-line px-4 py-3">
          <p className="text-[11px] text-ink-faint">
            {t("app.name")} · v0.3.0
          </p>
        </footer>
      </aside>

      {/* Inline keyframes (kept local so the drawer is self-contained) */}
      <style>{`
        @keyframes more-drawer-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>,
    document.body,
  );
}
