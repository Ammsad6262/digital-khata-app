"use client";

/**
 * AuthGate — wraps the app and checks auth status before rendering.
 *
 * Handles 3 states:
 *   1. Loading (spinner)
 *   2. Error (shows actual error, NO auto-retry, manual button only)
 *   3. Success (renders app or PIN screen)
 *
 * IMPORTANT: No window.location.reload() anywhere — that caused the infinite loop.
 */

import { useEffect, useState, type ReactNode } from "react";
import { PinUnlockScreen } from "@/components/auth/PinUnlockScreen";

type AuthStatus = {
  hasPin: boolean;
  unlocked: boolean;
  businessName: string | null;
};

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function checkAuth() {
    setLoading(true);
    setError(null);

    try {
      const statusRes = await fetch("/api/auth/status", { cache: "no-store" });

      if (!statusRes.ok) {
        let msg = `Server error (${statusRes.status})`;
        try {
          const j = await statusRes.json();
          if (j?.error?.message) msg = j.error.message;
        } catch {}
        setError(msg);
        setLoading(false);
        return;
      }

      const statusJson = await statusRes.json();

      if (!statusJson.ok) {
        setError(statusJson.error?.message || "Failed to check auth status.");
        setLoading(false);
        return;
      }

      const s = statusJson.data as AuthStatus;

      // If no PIN set and not unlocked → auto-unlock
      if (!s.hasPin && !s.unlocked) {
        const unlockRes = await fetch("/api/auth/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: "" }),
        });

        if (unlockRes.ok) {
          const unlockJson = await unlockRes.json();
          if (unlockJson.ok) {
            // Update state directly — NO RELOAD
            setStatus({ hasPin: false, unlocked: true, businessName: s.businessName });
            setLoading(false);
            return;
          }
        }

        // Unlock failed — show error, DON'T loop
        let msg = "Auto-unlock failed.";
        try {
          const j = await unlockRes.json();
          if (j?.error?.message) msg = j.error.message;
        } catch {}
        setError(msg);
        setLoading(false);
        return;
      }

      setStatus(s);
      setLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      setError(msg);
      setLoading(false);
    }
  }

  useEffect(() => {
    checkAuth();
  }, []);

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

  // Error — NO auto-retry, manual button only
  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-slate-900">{error}</p>
          <p className="mt-2 text-xs text-slate-500">
            Check Vercel Environment Variables: DATABASE_URL must use the
            pooler URL (pooler.supabase.com), not the direct URL.
          </p>
          <button
            type="button"
            onClick={() => checkAuth()}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // App unlocked
  if (status?.unlocked) {
    return <>{children}</>;
  }

  // PIN screen
  return (
    <PinUnlockScreen
      hasPin={status?.hasPin ?? false}
      businessName={status?.businessName ?? null}
      onUnlocked={() => {
        setStatus((prev) => prev ? { ...prev, unlocked: true } : null);
      }}
    />
  );
}
