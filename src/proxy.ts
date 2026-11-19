/**
 * Proxy — server-side auth enforcement (renamed from middleware in Next 16).
 *
 * Verifies the JWT auth token (dk_auth_token cookie) on ALL /api/* routes
 * EXCEPT public endpoints (auth/register, auth/login, auth/status, auth/me,
 * auth/unlock, health). If no valid token, returns 401.
 *
 * Uses the Node.js runtime (Next 16 default for proxy); crypto.subtle is
 * available there.
 *
 * NOTE: This proxy enforces ACCOUNT-level auth (email/password login).
 * The PIN system (dk_session cookie) is a SEPARATE client-side lock that
 * remains in AuthGate for device-level protection. Both can coexist.
 */

import { NextRequest, NextResponse } from "next/server";

// Public routes that don't require JWT auth
// (admin endpoints use x-admin-secret instead of a JWT cookie)
const PUBLIC_ROUTES = [
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
  "/api/auth/me",
  "/api/auth/unlock",
  "/api/auth/reset-password",
  "/api/health",
  "/api/admin/codes",
  "/api/admin/password-reset",
  "/api/admin/diagnostics",
  "/api/admin/licensing",
];

export const config = {
  // Run the proxy on all API routes
  matcher: "/api/:path*",
};

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Check if this is a public route
  if (PUBLIC_ROUTES.some((route) => path === route || path.startsWith(route + "/"))) {
    return NextResponse.next();
  }

  // The web app authenticates with the httpOnly `dk_auth_token` cookie. The
  // native app has no cookie jar, so it sends the same signed JWT as
  // `Authorization: Bearer <token>`. Both are verified identically below; the
  // Bearer form is only honoured when it is actually present, so a browser
  // request is unaffected.
  const authorization = req.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const cookieToken = req.cookies.get("dk_auth_token")?.value;
  const token = bearer || cookieToken;

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
      // Clear the invalid cookie and reject. A native client has no cookie to
      // clear; it simply receives the 401 and signs in again.
      const res = NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Session expired. Please log in again." } },
        { status: 401 },
      );
      if (cookieToken) res.cookies.delete("dk_auth_token");
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

    return typeof body.userId === "string" && body.userId
      ? { userId: body.userId }
      : null;
  } catch {
    return null;
  }
}
