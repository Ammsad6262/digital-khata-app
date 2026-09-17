"use client";

/**
 * AuthGate — wraps the app and checks auth status before rendering.
 *
 * Flow:
 *   1. On mount, calls GET /api/auth/status
 *   2. If unlocked → render children (the app)
 *   3. If !unlocked && hasPin → show PinUnlockScreen
 *   4. If !unlocked && !hasPin → auto-unlock by calling POST /api/auth/unlock
 *      then set status to unlocked WITHOUT reloading (prevents infinite loop)
 *
 * If any step fails, shows the ACTUAL error message from the server
 * (not just "Network error") so we can debug connection issues.
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

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      try {
        // 1. Check if we need a PIN
        const statusRes = await fetch("/api/auth/status", { cache: "no-store" });

        if (!statusRes.ok) {
          // Try to read the error from the response body
          let errorMsg = `Server returned ${statusRes.status} ${statusRes.statusText}`;
          try {
            const errorJson = await statusRes.json();
            if (errorJson?.error?.message) {
              errorMsg = errorJson.error.message;
            }
          } catch {}
          if (mounted) setError(errorMsg);
          return;
        }

        const statusJson = await statusRes.json();
        if (!mounted) return;

        if (!statusJson.ok) {
          setError(statusJson.error?.message || "Failed to check auth status.");
          return;
        }

        const s = statusJson.data as AuthStatus;

        // 2. If no PIN is set and not unlocked, auto-unlock
        if (!s.hasPin && !s.unlocked) {
          const unlockRes = await fetch("/api/auth/unlock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: "" }),
          });

          if (!mounted) return;

          if (unlockRes.ok) {
            const unlockJson = await unlockRes.json();
            if (unlockJson.ok) {
              setStatus({ hasPin: false, unlocked: true, businessName: s.businessName });
              return;
            }
            setError(unlockJson.error?.message || "Auto-unlock failed.");
            return;
          }

          // Show the actual server error
          let errorMsg = `Unlock failed (${unlockRes.status})`;
          try {
            const errorJson = await unlockRes.json();
            if (errorJson?.error?.message) errorMsg = errorJson.error.message;
          } catch {}
          setError(errorMsg);
          return;
        }

        setStatus(s);
      } catch (err) {
        if (mounted) {
          // Show the ACTUAL error, not just "Network error"
          const msg = err instanceof Error ? err.message : String(err);
          setError(`Connection error: ${msg}`);
        }
      }
    }

    checkAuth();
    return () => { mounted = false; };
  }, []);

  // Loading state
  if (!status && !error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-slate-900">{error}</p>
          <p className="mt-2 text-xs text-slate-500">
            If this is a database error, check that DATABASE_URL is set correctly
            in Vercel Environment Variables.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // If unlocked, render the app
  if (status!.unlocked) {
    return <>{children}</>;
  }

  // If not unlocked, show PIN screen
  return (
    <PinUnlockScreen
      hasPin={status!.hasPin}
      businessName={status!.businessName}
      onUnlocked={() => {
        setStatus((prev) => prev ? { ...prev, unlocked: true } : null);
      }}
    />
  );
}
