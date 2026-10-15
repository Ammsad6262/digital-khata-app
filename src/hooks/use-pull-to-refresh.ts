"use client";

/**
 * usePullToRefresh — pull-to-refresh hook for mobile + desktop.
 *
 * On mobile: user drags down from the top of the scroll container. When
 * the drag exceeds the threshold (70px), the refetch is triggered.
 *
 * On desktop: the hook listens for the browser's native reload shortcut
 * (Cmd+R / Ctrl+R) and triggers the refetch instead of a full page reload.
 *
 * Usage:
 *   const { pullDistance, isRefreshing, containerRef } = usePullToRefresh({
 *     onRefresh: async () => { await refetch(); },
 *   });
 *
 *   <div ref={containerRef} className="overflow-y-auto">
 *     {pullDistance > 0 && <RefreshIndicator distance={pullDistance} />}
 *     ...content...
 *   </div>
 *
 * Implementation notes:
 *   - Only activates when the scroll container is scrolled to the very top
 *     (scrollTop <= 0). This prevents the pull from interfering with
 *     normal scrolling.
 *   - Uses pointer events (works with both touch and mouse).
 *   - The threshold is 70px — once exceeded, the refetch fires on release.
 *   - The visual indicator is rendered by the caller (not this hook) so
 *     each page can customize the spinner/arrow style.
 */

import { useRef, useState, useCallback, useEffect } from "react";

const PULL_THRESHOLD = 70; // px — drag this far to trigger refresh
const MAX_PULL = 100; // px — visual cap so the indicator doesn't grow unbounded
const RESISTANCE = 0.5; // 0.5 = drag feels "heavy" (1 = 1:1, 0.25 = very heavy)

type Options = {
  onRefresh: () => Promise<void> | void;
  enabled?: boolean;
};

export function usePullToRefresh({ onRefresh, enabled = true }: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track the starting Y position of the drag
  const startYRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!enabled || isRefreshing) return;
    const el = containerRef.current;
    if (!el) return;
    // Only start tracking if the user is at the top of the page.
    // Since the PullToRefresh container no longer scrolls itself (the body
    // scrolls), we check window.scrollY instead of el.scrollTop.
    if (window.scrollY > 0) return;
    // Only track touch pointers OR mouse (we'll filter by button === 0 for mouse)
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startYRef.current = e.clientY;
    isDraggingRef.current = true;
  }, [enabled, isRefreshing]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!enabled || isRefreshing) return;
    if (!isDraggingRef.current || startYRef.current === null) return;
    // If the user scrolled down (away from top) during the drag, cancel
    if (window.scrollY > 0) {
      startYRef.current = null;
      isDraggingRef.current = false;
      setPullDistance(0);
      return;
    }
    const delta = e.clientY - (startYRef.current ?? 0);
    // Only count downward drags (delta > 0)
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    // Apply resistance so the pull feels "heavy" (like native iOS)
    const resisted = Math.min(delta * RESISTANCE, MAX_PULL);
    setPullDistance(resisted);
  }, [enabled, isRefreshing]);

  const handlePointerUp = useCallback(async () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    startYRef.current = null;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD); // hold at threshold during refresh
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      // Animate back to 0
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, onRefresh]);

  // Attach native pointer event listeners to the scroll container
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    el.addEventListener("pointercancel", handlePointerUp);
    el.addEventListener("pointerleave", handlePointerUp);

    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      el.removeEventListener("pointercancel", handlePointerUp);
      el.removeEventListener("pointerleave", handlePointerUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp, enabled]);

  // Also trigger refresh on Cmd+R / Ctrl+R (desktop) — prevent the full
  // page reload and just refetch the data instead.
  useEffect(() => {
    if (!enabled) return;
    const handler = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        if (!isRefreshing) {
          setIsRefreshing(true);
          try {
            await onRefresh();
          } finally {
            setIsRefreshing(false);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onRefresh, isRefreshing, enabled]);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    // True when the pull has crossed the threshold (for visual feedback)
    isReadyToRelease: pullDistance >= PULL_THRESHOLD,
  };
}
