/**
 * Next.js proxy (formerly middleware) — enforces session auth on all /api/* routes.
 *
 * In Next.js 16, the "middleware" convention was renamed to "proxy".
 * This file was previously called middleware.ts.
 *
 * Whitelist (no session required):
 *   - /api/auth/*     (unlock, lock, status — needed to GET a session)
 *   - /api/health     (health check — doesn't expose business data)
 *
 * All other /api/* routes require a valid session cookie.
 * If no session → returns 401 with { ok: false, error: { code: "UNAUTHORIZED" } }
 *
 * The middleware runs in the Edge runtime — it does NOT use Prisma.
 * It only checks the HMAC signature + expiry of the session cookie.
 *
 * Auth flow:
 *   1. Client calls GET /api/auth/status → { hasPin, unlocked }
 *   2. If !unlocked → client calls POST /api/auth/unlock with PIN
 *   3. Server verifies PIN → sets HttpOnly session cookie
 *   4. All subsequent /api/* calls are allowed by this middleware
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Routes that don't require auth
const PUBLIC_ROUTES = [
  "/api/auth/unlock",
  "/api/auth/lock",
  "/api/auth/status",
  "/api/health",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /api/* routes (not page routes — those show error states on 401)
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Check whitelist
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    return NextResponse.next();
  }

  // Check session cookie (async — uses Web Crypto API)
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValid = await verifySession(sessionCookie);

  if (!isValid) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Session expired or missing. Please unlock the app.",
        },
      },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

// Matcher: run on all /api/* routes
export const config = {
  matcher: ["/api/:path*"],
};
