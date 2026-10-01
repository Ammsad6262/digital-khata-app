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
      {/* Floating + button — always visible on Dashboard + Sales pages.
          On desktop (max-width: 1024px container), the button aligns to the
          right edge of the centered app shell instead of the viewport edge,
          so it doesn't float disconnected in the desktop margin. */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-transform hover:scale-105 active:scale-95"
        style={{
          // On mobile (≤1024px), 1rem from the right edge of the viewport.
          // On desktop (>1024px), aligned to the right edge of the centered
          // app shell (1024px wide, centered) + 1rem padding.
          right: "max(1rem, calc((100vw - 1024px) / 2 + 1rem))",
        }}
        aria-label="Quick add"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Bottom sheet overlay */}
      {isOpen ? (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setIsOpen(false)}
          />

          {/* Bottom sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[480px] rounded-t-2xl bg-white p-4 pb-8 shadow-2xl"
               style={{ animation: "slideUp 0.2s ease-out" }}>
            {/* Drag handle */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />

            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
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

            {/* Action grid */}
            <div className="grid grid-cols-3 gap-3">
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
