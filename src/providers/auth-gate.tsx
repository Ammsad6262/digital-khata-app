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

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { PinUnlockScreen } from "@/components/auth/PinUnlockScreen";
import { ExpiredAccessScreen } from "@/components/subscription/ExpiredAccessScreen";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailBanner";
import { VerifyEmailWall } from "@/components/auth/VerifyEmailWall";
import { useLanguage } from "@/providers/language-provider";
import { ThemeSync } from "@/providers/theme-sync";
import { isEmailVerificationEnforced } from "@/lib/services/email-verification";

type AuthStatus = {
  hasPin: boolean;
  unlocked: boolean;
  businessName: string | null;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  /** ISO timestamp, or null when the address has not been confirmed. */
  emailVerifiedAt?: string | null;
};

// Pages that don't need auth (login/register are standalone)
const PUBLIC_PAGES = ["/login", "/register", "/reset-password", "/verify-email", "/admin"];

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

// Pages that stay reachable when email verification is ENFORCED. Logging out
// is always available on the wall itself.
const ACCESSIBLE_WHEN_UNVERIFIED = [
  "/verify-email",
  "/more/settings",
  "/more/subscription",
  "/more/redeem",
];

const VERIFY_BANNER_DISMISSED_KEY = "dk_verify_banner_dismissed";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [pinStatus, setPinStatus] = useState<AuthStatus | null>(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [emailEnforced, setEmailEnforced] = useState(false);
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Boot the three auth checks once per signed-in session, not on every route
  // change. The public pages reset it so logging out and back in re-checks.
  const bootedRef = useRef(false);

  // Remember a dismissal for the browser session (survives reloads, not a new
  // session) and react when /verify-email confirms the address.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(VERIFY_BANNER_DISMISSED_KEY) === "1") {
        setVerifyBannerDismissed(true);
      }
    } catch {
      /* private mode — the banner simply reappears */
    }

    const onVerified = () => {
      setUser((prev) =>
        prev ? { ...prev, emailVerifiedAt: new Date().toISOString() } : prev,
      );
    };
    window.addEventListener("dk:email-verified", onVerified);
    return () => window.removeEventListener("dk:email-verified", onVerified);
  }, []);

  useEffect(() => {
    // Skip auth check entirely on login/register pages
    if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      bootedRef.current = false;
      setUser(null); // null = not checked, just render children
      return;
    }

    if (bootedRef.current) return;
    bootedRef.current = true;

    let mounted = true;

    async function init() {
      try {
        // These three checks are independent. Running them sequentially cost
        // three round-trips before the app could paint — very noticeable on a
        // phone. Fire them together and read the results in order.
        const [meRes, pinRes, subRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/auth/status", { cache: "no-store" }),
          fetch("/api/subscription", { cache: "no-store" }).catch(() => null),
        ]);

        const meJson = await meRes.json();

        if (!mounted) return;

        if (!meJson.ok || !meJson.data?.user) {
          // Not logged in → redirect to login
          router.push("/login");
          return;
        }

        setUser(meJson.data.user);

        // The enforcement flag is a server-only env var, so the client cannot
        // read it from process.env; /api/auth/me reports the authoritative
        // value. isEmailVerificationEnforced() is a fallback for deployments
        // that inline it (and keeps this gate honest when the flag is off).
        setEmailEnforced(
          Boolean(meJson.data.emailVerificationEnforced) || isEmailVerificationEnforced(),
        );

        // 2. PIN status (already fetched in parallel above)
        const pinJson = await pinRes.json();

        if (!mounted) return;

        if (!pinJson.ok) {
          // PIN check failed — proceed without PIN (don't block the app)
          setPinStatus({ hasPin: false, unlocked: true, businessName: null });
        } else {
          const s = pinJson.data as AuthStatus;

          // If no PIN and not unlocked, auto-unlock. Do NOT return here: the
          // subscription result is already in flight and must still be applied,
          // otherwise an expired account could bypass the client paywall.
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
              } else {
                setPinStatus(s);
              }
            } catch {
              // Proceed even if unlock fails
              setPinStatus(s);
            }
          } else {
            setPinStatus(s);
          }
        }

        // 3. Subscription status (don't block on failure — network errors
        //    must NOT lock the user out of their account)
        if (subRes) {
          try {
            const subJson = await subRes.json();
            if (mounted && subJson.ok && subJson.data) {
              setSubscriptionExpired(subJson.data.isExpired);
            }
          } catch {
            // If subscription check fails, don't block — let the user in.
            // The API layer enforces access server-side anyway.
          }
        }
      } catch {
        bootedRef.current = false;
        if (mounted) setError(t("auth.serverUnreachable"));
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
      <div className="min-h-[100dvh] bg-app" aria-hidden="true" />
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-app p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-ink">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  // Not logged in (redirecting to login)
  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-app" aria-hidden="true" />
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

  // Email verification — flag-gated and OFF by default.
  //
  // With EMAIL_VERIFICATION_ENFORCED unset/false this block is never entered,
  // so the app behaves exactly as it did before the feature shipped. With it
  // on, an unverified account sees the wall on every path except the small
  // allowlist above (and never on /verify-email itself, which runs outside
  // this gate).
  const needsEmailVerification =
    emailEnforced &&
    !user.emailVerifiedAt &&
    !ACCESSIBLE_WHEN_UNVERIFIED.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (needsEmailVerification) {
    return <VerifyEmailWall email={user.email} />;
  }

  // Voluntary verification while the flag is off. In-flow, above the shell,
  // never fixed: it cannot cover the header, the bottom dock, a form action
  // bar, or a printed receipt. Dismissal lasts for the browser session.
  const showVerifyBanner =
    !emailEnforced &&
    !user.emailVerifiedAt &&
    !verifyBannerDismissed &&
    !pathname.endsWith("/receipt");

  const dismissVerifyBanner = () => {
    setVerifyBannerDismissed(true);
    try {
      sessionStorage.setItem(VERIFY_BANNER_DISMISSED_KEY, "1");
    } catch {
      /* private mode — dismiss for this page view only */
    }
  };

  // Authenticated + unlocked + (active subscription or on accessible page) → render app
  return (
    <>
      <ThemeSync />
      {showVerifyBanner ? <VerifyEmailBanner onDismiss={dismissVerifyBanner} /> : null}
      {children}
    </>
  );
}
