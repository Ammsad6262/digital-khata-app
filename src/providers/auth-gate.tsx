"use client";

/**
 * AuthGate — checks auth status on mount.
 *
 * Three-layer auth:
 *   1. Account auth (email/password JWT) — checked via /api/auth/me
 *      If not logged in → redirect to /login
 *   2. PIN lock (optional device-level lock) — checked via /api/auth/status
 *      If PIN is set and not unlocked → show PIN unlock screen
 *   3. Subscription access — checked via /api/subscription
 *      If expired → show ExpiredAccessScreen (but Settings/Subscription/Redeem
 *      pages remain accessible so the user can reactivate)
 */

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PinUnlockScreen } from "@/components/auth/PinUnlockScreen";
import { ExpiredAccessScreen } from "@/components/subscription/ExpiredAccessScreen";

type AuthStatus = {
  hasPin: boolean;
  unlocked: boolean;
  businessName: string | null;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
};

// Pages that don't need auth (login/register are standalone)
const PUBLIC_PAGES = ["/login", "/register"];

// Pages that remain accessible even when subscription is expired
// (so the user can reactivate their account)
const ACCESSIBLE_WHEN_EXPIRED = [
  "/more/settings",
  "/more/subscription",
  "/more/redeem",
  "/api/account",
  "/api/subscription",
  "/api/settings",
];

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [pinStatus, setPinStatus] = useState<AuthStatus | null>(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip auth check entirely on login/register pages
    if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      setUser(null); // null = not checked, just render children
      return;
    }

    let mounted = true;

    async function init() {
      try {
        // 1. Check account auth (JWT)
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        const meJson = await meRes.json();

        if (!mounted) return;

        if (!meJson.ok || !meJson.data?.user) {
          // Not logged in → redirect to login
          router.push("/login");
          return;
        }

        setUser(meJson.data.user);

        // 2. Check PIN status
        const pinRes = await fetch("/api/auth/status", { cache: "no-store" });
        const pinJson = await pinRes.json();

        if (!mounted) return;

        if (!pinJson.ok) {
          // PIN check failed — proceed without PIN (don't block the app)
          setPinStatus({ hasPin: false, unlocked: true, businessName: null });
        } else {
          const s = pinJson.data as AuthStatus;

          // If no PIN and not unlocked, auto-unlock
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
                setPinStatus({ hasPin: false, unlocked: true, businessName: s.businessName });
                return;
              }
            } catch {
              // Proceed even if unlock fails
            }
          }

          setPinStatus(s);
        }

        // 3. Check subscription status (don't block on failure — network errors
        //    must NOT lock the user out of their account)
        try {
          const subRes = await fetch("/api/subscription", { cache: "no-store" });
          const subJson = await subRes.json();
          if (mounted && subJson.ok && subJson.data) {
            setSubscriptionExpired(subJson.data.isExpired);
          }
        } catch {
          // If subscription check fails, don't block — let the user in.
          // The API layer enforces access server-side anyway.
        }
      } catch {
        if (mounted) setError("Cannot reach server. Check your connection.");
      }
    }

    init();
    return () => { mounted = false; };
  }, [router, pathname]);

  // Public pages (login/register) — skip auth entirely, render children
  if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return <>{children}</>;
  }

  // Loading — invisible bg to prevent FOUC
  if (user === undefined && !error) {
    return (
      <div className="min-h-[100dvh] bg-slate-50" aria-hidden="true" />
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

  // Not logged in (redirecting to login)
  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-slate-50" aria-hidden="true" />
    );
  }

  // PIN is set but not unlocked → show PIN screen
  if (pinStatus && pinStatus.hasPin && !pinStatus.unlocked) {
    return (
      <PinUnlockScreen
        hasPin={pinStatus.hasPin}
        businessName={pinStatus.businessName}
        onUnlocked={() => {
          setPinStatus((prev) => prev ? { ...prev, unlocked: true } : null);
        }}
      />
    );
  }

  // Subscription expired → show expired screen UNLESS the user is on an
  // accessible page (Settings, Subscription, Redeem, Account)
  if (subscriptionExpired && !ACCESSIBLE_WHEN_EXPIRED.some((p) => pathname.startsWith(p))) {
    return <ExpiredAccessScreen />;
  }

  // Authenticated + unlocked + (active subscription or on accessible page) → render app
  return <>{children}</>;
}
