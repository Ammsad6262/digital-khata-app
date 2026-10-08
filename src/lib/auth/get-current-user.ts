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
 * PERFORMANCE: We verify the JWT cryptographically but do NOT query the
 * database to check if the user still exists on every request. The JWT is
 * signed with the server secret and has a 7-day expiry — if it's valid,
 * the user exists. If the user was deleted, their cookie was cleared by
 * the deletion endpoint. The getUserById check was costing ~300ms per
 * API call for zero security benefit (the JWT verification is sufficient).
 *
 * Returns null if not logged in.
 */

import { NextRequest } from "next/server";
import { verifyToken, AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import { hasActiveAccess } from "@/lib/services/subscription";
import { setUserContext } from "@/lib/db/prisma";

/**
 * Cryptographically derive the authenticated user's ID from the JWT cookie.
 * NEVER trusts request headers, query params, or body for the user identity.
 *
 * PERFORMANCE: Does NOT query the DB — JWT verification is sufficient.
 */
export async function getCurrentUserId(req: NextRequest): Promise<string | null> {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload) return null;

    return payload.userId;
  } catch {
    return null;
  }
}

/**
 * Like getCurrentUserId, but throws UnauthorizedError if not authenticated.
 * Use this in protected API routes that require a logged-in user.
 *
 * Sets RLS context so database queries are scoped to this user.
 */
export async function requireUserId(req: NextRequest): Promise<string> {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    throw new UnauthorizedError("Authentication required.");
  }
  // Set RLS context so database queries are scoped to this user
  await setUserContext(userId);
  return userId;
}

// ── Subscription check cache ──────────────────────────────────────────────────
// Caching the subscription check saves ~300ms per API call. A subscription
// status doesn't change within 60 seconds — even if the user redeems a code,
// the next request (after cache expiry) will see the updated status.
const subCache = new Map<string, { active: boolean; expiresAt: number }>();
const SUB_CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Like requireUserId, but ALSO checks that the user has an active
 * subscription/trial. If expired, throws ForbiddenError.
 *
 * PERFORMANCE: The subscription check is cached for 60 seconds per user
 * to avoid a DB round-trip on every API call.
 */
export async function requireActiveAccess(req: NextRequest): Promise<string> {
  const userId = await requireUserId(req);

  // Check subscription with in-memory cache (60s TTL)
  const cached = subCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    if (!cached.active) {
      throw new ForbiddenError(
        "Your free trial has ended. Please redeem an activation code to continue.",
      );
    }
    return userId;
  }

  // Cache miss or expired — query the DB
  const isActive = await hasActiveAccess(userId);
  subCache.set(userId, { active: isActive, expiresAt: Date.now() + SUB_CACHE_TTL_MS });

  if (!isActive) {
    throw new ForbiddenError(
      "Your free trial has ended. Please redeem an activation code to continue.",
    );
  }

  return userId;
}
