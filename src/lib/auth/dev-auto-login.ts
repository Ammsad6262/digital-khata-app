/**
 * LOCAL DEVELOPMENT ONLY — automatic sign-in bypass.
 *
 * When the app is running locally (`next dev`), the sign-in / sign-up screen
 * gets in the way of UI work. While this bypass is active the app behaves as
 * if a fixed local account is always signed in, and /login + /register simply
 * redirect to /dashboard.
 *
 * It is IMPOSSIBLE for this to affect a production deployment:
 *   - `process.env.NODE_ENV` is statically replaced by Next.js, so the
 *     production build contains a permanent `false` here (dead code).
 *   - `isDevAutoLoginEnabled()` therefore always returns false in any
 *     `next build` output.
 *
 * Controls (all optional):
 *   DEV_AUTH_BYPASS=0        → turn the bypass OFF locally (normal login).
 *   DEV_AUTO_LOGIN_EMAIL=... → which local account to auto-sign-in as.
 *                              Defaults to demo@example.com, falling back to
 *                              the oldest account if that email doesn't exist.
 */

import { prisma } from "@/lib/db/prisma";

export type DevAutoLoginUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

/** True only while running the app locally in development. */
export function isDevAutoLoginEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.DEV_AUTH_BYPASS === "0") return false;
  return true;
}

let cached: DevAutoLoginUser | null | undefined;

/**
 * The local account the app auto-signs-in as, or null when the bypass is off
 * (or no users exist yet). Safe to call on every request — result is cached.
 */
export async function getDevAutoLoginUser(): Promise<DevAutoLoginUser | null> {
  if (!isDevAutoLoginEnabled()) return null;
  if (cached !== undefined) return cached;

  const select = { id: true, name: true, email: true, createdAt: true } as const;
  const email = process.env.DEV_AUTO_LOGIN_EMAIL || "demo@example.com";

  try {
    cached =
      (await prisma.user.findUnique({ where: { email }, select })) ??
      (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select }));
  } catch {
    cached = null;
  }

  return cached;
}
