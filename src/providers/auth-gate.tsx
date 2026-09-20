"use client";

/**
 * AuthGate — minimal version that works everywhere (Vercel + localhost).
 *
 * The previous versions had complex auth logic that caused infinite reload
 * loops on Vercel. This version is dead simple:
 *
 * 1. Show a loading spinner briefly
 * 2. Render the app
 *
 * The app itself handles auth:
 * - If no PIN is set, everything works (no auth needed)
 * - If a PIN is set, the user sees the PIN screen
 * - API routes that need auth will return 401, and React Query shows errors
 *
 * No window.location.reload(), no fetch() to /api/auth/unlock, no cookie
 * manipulation from JavaScript. Just render the app and let it handle itself.
 */

import { useEffect, useState, type ReactNode } from "react";

export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Brief delay to prevent flash of unstyled content
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

  return <>{children}</>;
}
