"use client";

/**
 * AuthGate — checks auth status on mount, shows PIN screen if needed.
 *
 * Without the proxy middleware, API routes are accessible without a session.
 * This gate provides the UX layer:
 *   - If no PIN is set → render app immediately
 *   - If PIN is set and session is valid → render app
 *   - If PIN is set and no session → show PIN unlock screen
 *
 * The gate calls /api/auth/unlock when no PIN is set to establish a session
 * cookie (for future use if the user sets a PIN later). It does NOT reload
 * the page — it updates React state directly.
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

    async function init() {
      try {
        // 1. Check auth status
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        const json = await res.json();

        if (!mounted) return;

        if (!json.ok) {
          setError(json.error?.message || "Failed to check auth status.");
          return;
        }

        const s = json.data as AuthStatus;

        // 2. If no PIN and not unlocked, auto-unlock to set session cookie
        if (!s.hasPin && !s.unlocked) {
          try {
            const unlockRes = await fetch("/api/auth/unlock", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pin: "" }),
              credentials: "same-origin",
            });
            const unlockJson = await unlockRes.json();
            if (mounted && unlockJson.ok) {
              setStatus({ hasPin: false, unlocked: true, businessName: s.businessName });
              return;
            }
          } catch {
            // Even if unlock fails, proceed — API routes are accessible without proxy
          }
        }

        setStatus(s);
      } catch {
        if (mounted) setError("Cannot reach server. Check your connection.");
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  // Loading — invisible (bg matches app bg, no layout shift when app renders)
  if (!status && !error) {
    return (
      <div className="min-h-[100dvh] bg-slate-50" aria-hidden="true">
        {/* Prevent FOUC: same bg as app shell, no spinner that causes layout shift */}
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-slate-900">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Unlocked or no PIN → render app
  if (status?.unlocked || !status?.hasPin) {
    return <>{children}</>;
  }

  // PIN is set but not unlocked → show PIN screen
  return (
    <PinUnlockScreen
      hasPin={status.hasPin}
      businessName={status.businessName}
      onUnlocked={() => {
        setStatus((prev) => prev ? { ...prev, unlocked: true } : null);
      }}
    />
  );
}
