"use client";

/**
 * Toast provider — minimal, dependency-free toast system.
 *
 * Usage from any client component:
 *   const toast = useToast();
 *   toast.success("customer.customerAdded");   // ← translation key (auto-translated)
 *   toast.success("Customer added");            // ← plain English (shown as-is)
 *   toast.error("api.sale.notFound", { id: 123 }); // ← translation key + params
 *   toast.error(err.message);                   // ← will auto-translate if it's a key
 *
 * Auto-translate behavior:
 *   - If the message matches a known translation key (e.g. "api.sale.notFound"),
 *     the toast displays the translated text using the user's selected language.
 *   - If params are provided (or the message is from an ApiError with params),
 *     {placeholder} tokens are interpolated.
 *   - If the message is plain English (or unknown key), it's shown as-is.
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
import { useLanguage } from "@/providers/language-provider";
import { translations, type TranslationKey } from "@/lib/i18n/translations";

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
};

type ToastContextValue = {
  success: (message: string, params?: Record<string, string | number>) => void;
  error: (message: string, params?: Record<string, string | number>) => void;
  info: (message: string, params?: Record<string, string | number>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let toastIdCounter = 0;

/**
 * Check if a string is a known translation key.
 * Conservative: must contain a dot, no whitespace, AND be a key in `translations`.
 */
function isTranslationKey(s: string): s is TranslationKey {
  if (!s || typeof s !== "string") return false;
  if (!s.includes(".") || /\s/.test(s)) return false;
  return Object.prototype.hasOwnProperty.call(translations, s);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t, tParams } = useLanguage();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((to) => to.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, params?: Record<string, string | number>) => {
      const id = ++toastIdCounter;
      // If the message is a known translation key, translate it.
      let displayMessage = message;
      if (isTranslationKey(message)) {
        displayMessage = params ? tParams(message, params) : t(message);
      }
      setToasts((prev) => [...prev, { id, variant, message: displayMessage }]);
      const ttl = variant === "error" ? 5000 : 3000;
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss, t, tParams],
  );

  const value: ToastContextValue = {
    success: (m, p) => push("success", m, p),
    error: (m, p) => push("error", m, p),
    info: (m, p) => push("info", m, p),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex w-full max-w-app flex-col gap-2 px-3"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((to) => (
          <ToastItem key={to.id} toast={to} onDismiss={() => dismiss(to.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { t } = useLanguage();
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
        aria-label={t("common.dismiss")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  // During static prerendering, ToastProvider may not be mounted yet.
  // Return a no-op default instead of throwing — this prevents
  // "Cannot read properties of null (reading 'useContext')" errors
  // during `next build`'s static generation phase.
  if (!ctx) {
    return {
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}
