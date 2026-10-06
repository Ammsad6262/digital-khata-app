"use client";

/**
 * QuickAddMenu — universal "+ Add" floating action button.
 *
 * Shows a bottom sheet with simple real-world actions:
 *   - Sold something → /sales/new
 *   - Received money → /payments/new
 *   - Spent money → /more/expenses/new
 *   - Added stock → /stock/add
 *   - New customer → /more/customers/new
 *   - New product → /more/products/new
 *
 * Tapping the FAB opens the sheet. Tapping an action navigates.
 * Tapping outside or the close button dismisses.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  ShoppingCart,
  Wallet,
  Receipt,
  Package,
  UserPlus,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Action = {
  icon: typeof Plus;
  label: string;
  href: string;
  color: string;
  bgColor: string;
};

const ACTIONS: Action[] = [
  {
    icon: ShoppingCart,
    label: "Sold something",
    href: "/sales/new",
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  {
    icon: Wallet,
    label: "Received money",
    href: "/payments/new",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    icon: Receipt,
    label: "Spent money",
    href: "/more/expenses/new",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  {
    icon: Package,
    label: "Added stock",
    href: "/stock/add",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  {
    icon: UserPlus,
    label: "New customer",
    href: "/more/customers/new",
    color: "text-brand-600",
    bgColor: "bg-brand-50",
  },
  {
    icon: Box,
    label: "New product",
    href: "/more/products/new",
    color: "text-slate-600",
    bgColor: "bg-slate-100",
  },
];

export function QuickAddMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const handleSelect = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Floating + button — on the LEFT side of the dashboard.
          Moved left to make room for the prominent Smart Khata microphone
          button on the right. This button opens the manual "What happened?"
          action sheet (Sale / Payment / Expense / Stock / Customer / Product).
          On desktop, aligns to the left edge of the centered 1024px app shell. */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md shadow-slate-900/5 transition-transform hover:scale-105 active:scale-95"
        style={{
          // On mobile, 1rem from the left edge. On desktop, aligned to
          // the left edge of the centered 1024px app shell.
          left: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))",
        }}
        aria-label="Quick add — manual entry options"
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
      </button>

      {/* Bottom sheet overlay */}
      {isOpen ? (
        <>
          {/* Backdrop — covers the entire viewport including bottom nav */}
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setIsOpen(false)}
          />

          {/* Bottom sheet — scrolls if content exceeds viewport height.
              max-h-[85dvh] keeps it within the viewport with room for the
              status bar. overflow-y-auto makes the content area scrollable.
              pb-[env(safe-area-inset-bottom)] handles iPhone notch/home bar. */}
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] max-w-[480px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl"
               style={{ animation: "slideUp 0.2s ease-out", paddingBottom: "env(safe-area-inset-bottom)" }}>
            {/* Drag handle */}
            <div className="mx-auto mt-3 mb-2 h-1 w-10 shrink-0 rounded-full bg-slate-200" />

            {/* Header — sticky, doesn't scroll */}
            <div className="flex shrink-0 items-center justify-between px-4 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                What happened?
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Action grid — scrolls if needed */}
            <div className="grid grid-cols-3 gap-3 overflow-y-auto px-4 pb-6">
              {ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.href}
                    type="button"
                    onClick={() => handleSelect(action.href)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-3 transition-colors hover:bg-slate-50 active:bg-slate-100"
                  >
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      action.bgColor,
                    )}>
                      <Icon className={cn("h-5 w-5", action.color)} />
                    </div>
                    <span className="text-center text-[11px] font-medium leading-tight text-slate-700">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inline keyframe — no need for a separate CSS file */}
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
          `}</style>
        </>
      ) : null}
    </>
  );
}
