"use client";

/**
 * DeleteButton — destructive action button with two-step confirmation.
 *
 * Shows a red "Delete" text button. On first tap, it expands into a
 * confirmation panel with "Cancel" and "Yes, Delete" buttons.
 *
 * Props:
 *   - onConfirm: async function called when user confirms deletion
 *   - loading: boolean — shows spinner during deletion
 *   - label: button text (default: "Delete")
 *   - confirmLabel: confirm button text (default: "Yes, Delete")
 *   - confirmMessage: explanation shown in the confirmation panel
 *   - errorMessage: error to display if deletion fails (from API)
 */

import { useState, type ReactNode } from "react";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useLanguage } from "@/providers/language-provider";

export function DeleteButton({
  onConfirm,
  loading = false,
  errorMessage,
}: {
  onConfirm: () => void;
  loading?: boolean;
  errorMessage?: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const { t } = useLanguage();

  if (errorMessage) {
    // Show error message from failed deletion attempt
    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-xs text-red-800">{errorMessage}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 className="mr-1 inline h-3.5 w-3.5" />
          {t("common.delete")}
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-3">
        <div>
          <p className="text-sm font-semibold text-red-900">
            {t("common.deleteConfirm")}
          </p>
          <p className="mt-1 text-xs text-red-700">
            {t("common.deleteWarning")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              onConfirm();
            }}
            className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                {t("common.deleting")}
              </>
            ) : (
              <>
                <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                {t("common.yesDelete")}
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50"
    >
      <Trash2 className="mr-1.5 inline h-3.5 w-3.5" />
      {t("common.delete")}
    </button>
  );
}
