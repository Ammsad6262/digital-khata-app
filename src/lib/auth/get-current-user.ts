/**
 * Helper to get the current authenticated user's ID from a NextRequest.
 *
 * SECURITY: Identity is ALWAYS derived from the cryptographically signed JWT
 * in the `dk_auth_token` HttpOnly cookie. NEVER from request headers, query
 * parameters, JSON body, or any client-controllable input.
 *
 * The middleware (src/middleware.ts) verifies the JWT cookie on every /api/*
 * request (except a small allowlist of public auth endpoints). When valid,
 * the middleware OVERWRITES any client-sent `x-user-id` header with the
 * JWT-derived value — so a malicious client cannot spoof the header.
 *
 * Defense-in-depth: even if a route is somehow reachable without going
 * through middleware, this helper falls back to verifying the JWT cookie
 * directly. The fallback path NEVER reads the header — only the cookie.
 *
 * Returns null if not logged in.
 */

import { NextRequest } from "next/server";
import { verifyToken, getUserById, AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { UnauthorizedError } from "@/lib/errors";

/**
 * Cryptographically derive the authenticated user's ID from the JWT cookie.
 * NEVER trusts request headers, query params, or body for the user identity.
 */
export async function getCurrentUserId(req: NextRequest): Promise<string | null> {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload) return null;

    // Defense-in-depth: also verify the user still exists in the DB.
    // (If the user was deleted after the JWT was issued, we reject.)
    const user = await getUserById(payload.userId);
    if (!user) return null;

    return payload.userId;
  } catch {
    return null;
  }
}

/**
 * Like getCurrentUserId, but throws UnauthorizedError if not authenticated.
 * Use this in protected API routes that require a logged-in user.
 */
export async function requireUserId(req: NextRequest): Promise<string> {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    throw new UnauthorizedError("Authentication required.");
  }
  return userId;
}
