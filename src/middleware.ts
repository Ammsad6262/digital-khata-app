/**
 * Middleware — server-side auth enforcement.
 *
 * Verifies the JWT auth token (dk_auth_token cookie) on ALL /api/* routes
 * EXCEPT public endpoints (auth/register, auth/login, auth/status, auth/me,
 * auth/unlock, health). If no valid token, returns 401.
 *
 * Uses the Edge runtime (crypto.subtle is available there).
 *
 * NOTE: This middleware enforces ACCOUNT-level auth (email/password login).
 * The PIN system (dk_session cookie) is a SEPARATE client-side lock that
 * remains in AuthGate for device-level protection. Both can coexist.
 */

import { NextRequest, NextResponse } from "next/server";

// Public routes that don't require JWT auth
// (admin/codes uses x-admin-secret header instead of JWT cookie)
const PUBLIC_ROUTES = [
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  "/api/auth/me",
  "/api/auth/unlock",
  "/api/health",
  "/api/admin/codes",
];

export const config = {
  // Run middleware on all API routes
  matcher: "/api/:path*",
};

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Check if this is a public route
  if (PUBLIC_ROUTES.some((route) => path === route || path.startsWith(route + "/"))) {
    return NextResponse.next();
  }

  // Check for the auth token cookie
  const token = req.cookies.get("dk_auth_token")?.value;

  if (!token) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Please log in to continue." } },
      { status: 401 },
    );
  }

  // Verify the JWT token
  try {
    const payload = await verifyJwt(token);
    if (!payload) {
      // Clear the invalid cookie and reject
      const res = NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Session expired. Please log in again." } },
        { status: 401 },
      );
      res.cookies.delete("dk_auth_token");
      return res;
    }

    // Add userId to headers so API routes can read it
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-user-id", payload.userId);

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid session." } },
      { status: 401 },
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// JWT verification (Edge-compatible — uses crypto.subtle)
// ────────────────────────────────────────────────────────────────────────────

async function verifyJwt(token: string): Promise<{ userId: string } | null> {
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) return null;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const [headerB64, bodyB64, sigB64] = token.split(".");
    if (!headerB64 || !bodyB64 || !sigB64) return null;

    const data = `${headerB64}.${bodyB64}`;
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify("HMAC", key, sig, enc.encode(data));
    if (!valid) return null;

    const body = JSON.parse(atob(bodyB64));
    if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null;

    return body.userId ? { userId: body.userId as string } : null;
  } catch {
    return null;
  }
}
