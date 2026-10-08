"use client";

/**
 * StockAddMenu — bottom sheet with two actions for the Stock page:
 *   1. Add Product → /more/products/new
 *   2. Add Stock    → /stock/add
 *
 * Triggered by the "Add" pill button in the Stock page header.
 * Slides up smoothly from the bottom with a backdrop overlay.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, X, PackagePlus, ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Action = {
  icon: typeof Plus;
  label: string;
  description: string;
  href: string;
  color: string;
  bgColor: string;
};

const ACTIONS: Action[] = [
  {
    icon: PackagePlus,
    label: "Add Product",
    description: "Create a new product to track",
    href: "/more/products/new",
    color: "text-brand-600",
    bgColor: "bg-brand-50",
  },
  {
    icon: ArrowDownToLine,
    label: "Add Stock",
    description: "Record a purchase or restock",
    href: "/stock/add",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
];

export function StockAddMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const handleSelect = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* "Add" pill button — triggers the bottom sheet */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition-transform hover:scale-[1.02] active:scale-95"
        aria-label="Add product or stock"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        Add
      </button>

      {/* Bottom sheet — rendered to document.body via Portal so it escapes
          any parent stacking context (e.g. sticky headers at z-20) and
          always appears ABOVE the BottomNav (z-30). */}
      {mounted && isOpen
        ? createPortal(
            <>
              {/* Backdrop — covers entire viewport including bottom nav */}
              <div
                className="fixed inset-0 z-[60] bg-black/40"
                onClick={() => setIsOpen(false)}
                style={{ animation: "dk-fade-in 0.15s ease-out" }}
                aria-hidden
              />

              {/* Bottom sheet — z-[70] sits above backdrop AND BottomNav (z-30) */}
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Add product or stock"
                className="fixed inset-x-0 bottom-0 z-[70] mx-auto flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl"
                style={{
                  animation: "dk-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
                }}
              >
                {/* Drag handle */}
                <div className="mx-auto mt-3 mb-2 h-1 w-10 shrink-0 rounded-full bg-slate-200" />

                {/* Header — sticky */}
                <div className="flex shrink-0 items-center justify-between px-4 pb-3">
                  <h3 className="text-base font-semibold text-slate-900">
                    What do you want to add?
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

                {/* Action list — scrolls if needed */}
                <div className="space-y-2 overflow-y-auto px-4 pb-4">
                  {ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.href}
                        type="button"
                        onClick={() => handleSelect(action.href)}
                        className="flex w-full items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                            action.bgColor,
                          )}
                        >
                          <Icon className={cn("h-5 w-5", action.color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {action.label}
                          </p>
                          <p className="text-xs text-slate-500">
                            {action.description}
                          </p>
                        </div>
                        <Plus className="h-4 w-4 shrink-0 text-slate-300" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Inline keyframes — namespaced with `dk-` to avoid collisions */}
              <style>{`
                @keyframes dk-slide-up {
                  from { transform: translateY(100%); }
                  to   { transform: translateY(0); }
                }
                @keyframes dk-fade-in {
                  from { opacity: 0; }
                  to   { opacity: 1; }
                }
              `}</style>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
