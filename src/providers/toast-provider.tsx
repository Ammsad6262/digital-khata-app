"use client";

/**
 * Toast provider — minimal, dependency-free toast system.
 *
 * Usage from any client component:
 *   const toast = useToast();
 *   toast.success("Customer added");
 *   toast.error("Phone number already exists");
 *
 * Toasts auto-dismiss after 3 seconds (success) or 5 seconds (error).
 * Tap to dismiss early.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
};

type ToastContextValue = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev, { id, variant, message }]);
      const ttl = variant === "error" ? 5000 : 3000;
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss],
  );

  const value: ToastContextValue = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex w-full max-w-app flex-col gap-2 px-3"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const config = {
    success: {
      icon: CheckCircle2,
      iconColor: "text-brand-600",
      bg: "bg-white border-brand-200",
    },
    error: {
      icon: AlertCircle,
      iconColor: "text-red-600",
      bg: "bg-white border-red-200",
    },
    info: {
      icon: Info,
      iconColor: "text-blue-600",
      bg: "bg-white border-blue-200",
    },
  }[toast.variant];

  const Icon = config.icon;

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg shadow-slate-900/5",
        config.bg,
      )}
      role="status"
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.iconColor)} />
      <p className="flex-1 text-sm text-slate-900">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-slate-400 hover:text-slate-700"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}
