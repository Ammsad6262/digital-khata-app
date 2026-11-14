"use client";

/**
 * RefreshButton — a small, visible "refresh now" control for the app header.
 *
 * Pull-to-refresh is the primary gesture on phones, but a button is faster and
 * works with a mouse or keyboard. Tapping it invalidates every query, which
 * refetches the active screen immediately (and marks the rest stale).
 */

import { useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/providers/language-provider";
import { cn } from "@/lib/utils/cn";

export function RefreshButton({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const fetchingCount = useIsFetching();
  const [pulling, setPulling] = useState(false);
  const { t } = useLanguage();
  const busy = pulling || fetchingCount > 0;

  return (
    <button
      type="button"
      aria-label={t("common.refresh")}
      title={t("common.refresh")}
      aria-busy={busy}
      disabled={pulling}
      onClick={async () => {
        setPulling(true);
        try {
          await queryClient.invalidateQueries();
        } finally {
          setPulling(false);
        }
      }}
      className={cn(
        "rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-2 disabled:opacity-60",
        className,
      )}
    >
      <RefreshCw
        className={cn("h-[18px] w-[18px]", busy && "animate-spin")}
        strokeWidth={2}
      />
    </button>
  );
}
