"use client";

/**
 * AuthGate — wraps the app and checks auth status before rendering.
 *
 * Flow:
 *   1. On mount, calls GET /api/auth/status
 *   2. If unlocked → render children (the app)
 *   3. If !unlocked → show PinUnlockScreen
 *
 * The PinUnlockScreen handles the PIN entry + POST /api/auth/unlock flow.
 * On successful unlock, the page reloads to pick up the new session cookie.
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
        const statusJson = await statusRes.json();
        if (!mounted) return;

        if (!statusJson.ok) {
          setError("Failed to check auth status.");
          return;
        }

        const s = statusJson.data as AuthStatus;
        setStatus(s);

        // 2. If no PIN is set, auto-unlock (the app is unprotected by user's choice)
        if (!s.hasPin && !s.unlocked) {
          const unlockRes = await fetch("/api/auth/unlock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: "" }),
          });
          const unlockJson = await unlockRes.json();
          if (mounted && unlockJson.ok) {
            // Reload to pick up the session cookie
            window.location.reload();
          }
        }
      } catch {
        if (mounted) setError("Network error — can't reach server.");
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
        <div className="text-center">
          <p className="text-sm font-medium text-slate-900">{error}</p>
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
        // Reload the page to pick up the session cookie
        window.location.reload();
      }}
    />
  );
}
