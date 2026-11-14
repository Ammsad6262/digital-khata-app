"use client";

/**
 * usePullToRefresh — pull-to-refresh hook for mobile + desktop.
 *
 * On mobile: the owner drags down from the top of the page. Once the drag
 * passes the threshold (70px) the refetch runs on release. A real touch
 * implementation is used (not pointer events) because the page scrolls on the
 * body: the browser would otherwise claim the gesture and fire `pointercancel`
 * before the pull could complete.
 *
 * On desktop: mouse drag works the same way, and Cmd+R / Ctrl+R refreshes the
 * data without a full page reload.
 *
 * Usage:
 *   const { pullDistance, isRefreshing, containerRef } = usePullToRefresh({
 *     onRefresh: async () => { await refetch(); },
 *   });
 *
 *   <div ref={containerRef}>
 *     {pullDistance > 0 && <RefreshIndicator distance={pullDistance} />}
 *     ...content...
 *   </div>
 */

import { useRef, useState, useCallback, useEffect } from "react";

const PULL_THRESHOLD = 70; // px — drag this far to trigger refresh
const MAX_PULL = 100; // px — visual cap so the indicator doesn't grow unbounded
const RESISTANCE = 0.5; // 0.5 = drag feels "heavy" (1 = 1:1, 0.25 = very heavy)
const TOUCH_ACTIVATE = 8; // px of downward movement before we claim the gesture

type Options = {
  onRefresh: () => Promise<void> | void;
  enabled?: boolean;
};

export function usePullToRefresh({ onRefresh, enabled = true }: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Mirrors pullDistance for event handlers (state updates are asynchronous).
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const setPull = useCallback((value: number) => {
    pullRef.current = value;
    setPullDistance(value);
  }, []);

  // Keep the latest callback in a ref so `runRefresh` (and therefore the event
  // listeners) stay stable while the pull re-renders the page.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    setPull(PULL_THRESHOLD);
    try {
      await onRefreshRef.current();
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
      setPull(0);
    }
  }, [setPull]);

  // ── Touch (phones/tablets) ────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    let startY: number | null = null;
    let pulling = false;

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || window.scrollY > 0) {
        startY = null;
        pulling = false;
        return;
      }
      startY = event.touches[0]?.clientY ?? null;
      pulling = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startY === null) return;
      if (window.scrollY > 0) {
        startY = null;
        pulling = false;
        setPull(0);
        return;
      }
      const delta = (event.touches[0]?.clientY ?? 0) - startY;
      if (delta <= 0) {
        // Finger is moving up: a normal scroll. Do not interfere.
        if (pulling) setPull(0);
        pulling = false;
        return;
      }
      if (delta > TOUCH_ACTIVATE) {
        // At the top and pulling down: this is ours, not a scroll.
        if (event.cancelable) event.preventDefault();
        pulling = true;
      }
      if (pulling) setPull(Math.min(delta * RESISTANCE, MAX_PULL));
    };

    const finishTouch = () => {
      if (pulling && pullRef.current >= PULL_THRESHOLD) {
        void runRefresh();
      } else if (pulling) {
        setPull(0);
      }
      startY = null;
      pulling = false;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", finishTouch);
    el.addEventListener("touchcancel", finishTouch);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", finishTouch);
      el.removeEventListener("touchcancel", finishTouch);
    };
  }, [enabled, runRefresh, setPull]);

  // ── Mouse (desktop) ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    let startY: number | null = null;
    let pulling = false;

    const onPointerDown = (event: PointerEvent) => {
      // Touch is handled above; pointer events on touch devices would double up.
      if (event.pointerType === "touch") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (refreshingRef.current || window.scrollY > 0) return;
      startY = event.clientY;
      pulling = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (startY === null) return;
      if (window.scrollY > 0) {
        startY = null;
        pulling = false;
        setPull(0);
        return;
      }
      const delta = event.clientY - startY;
      if (delta <= 0) {
        if (pulling) setPull(0);
        pulling = false;
        return;
      }
      if (delta > TOUCH_ACTIVATE) pulling = true;
      if (pulling) setPull(Math.min(delta * RESISTANCE, MAX_PULL));
    };

    const finishPointer = () => {
      if (pulling && pullRef.current >= PULL_THRESHOLD) {
        void runRefresh();
      } else if (pulling) {
        setPull(0);
      }
      startY = null;
      pulling = false;
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", finishPointer);
    el.addEventListener("pointercancel", finishPointer);
    el.addEventListener("pointerleave", finishPointer);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", finishPointer);
      el.removeEventListener("pointercancel", finishPointer);
      el.removeEventListener("pointerleave", finishPointer);
    };
  }, [enabled, runRefresh, setPull]);

  // ── Cmd+R / Ctrl+R (desktop) ──────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "r") {
        event.preventDefault();
        void runRefresh();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, runRefresh]);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    isReadyToRelease: pullDistance >= PULL_THRESHOLD,
  };
}
