/**
 * Helper to get the current authenticated user's ID from a NextRequest.
 *
 * SECURITY: Identity is ALWAYS derived from the cryptographically signed JWT
 * in the `dk_auth_token` HttpOnly cookie. NEVER from request headers, query
 * parameters, JSON body, or any client-controllable input.
 *
 * The proxy (src/proxy.ts) verifies the JWT cookie on every /api/*
 * request (except a small allowlist of public auth endpoints). When valid,
 * the proxy OVERWRITES any client-sent `x-user-id` header with the
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
import { aiAllowed, getEntitlement } from "@/lib/services/entitlement";
import { type AiKeyPool, poolForCategory, setAiKeyPool } from "@/lib/ai/key-pool";
import { setUserContext } from "@/lib/db/prisma";

/**
 * Cryptographically derive the authenticated user's ID from the JWT cookie.
 * NEVER trusts request headers, query params, or body for the user identity.
 *
 * PERFORMANCE: Does NOT query the DB — JWT verification is sufficient.
 */
export async function getCurrentUserId(req: NextRequest): Promise<string | null> {
  try {
    const token = getRequestToken(req);
    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload) return null;

    return payload.userId;
  } catch {
    return null;
  }
}

/**
 * The bearer of the session: the httpOnly cookie for the web app, or the same
 * signed JWT in `Authorization: Bearer <token>` for the native app, which has
 * no cookie jar. Anything that is not a Bearer value is ignored, so a stray
 * `Authorization` header cannot change the outcome.
 */
export function getRequestToken(req: NextRequest): string | null {
  const authorization = req.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const value = authorization.slice(7).trim();
    if (value) return value;
  }
  return req.cookies.get(AUTH_COOKIE_NAME)?.value ?? null;
}

// ── Subscription check cache ──────────────────────────────────────────────────
// Caching the subscription check saves ~300ms per API call. A subscription
// status doesn't change within 60 seconds — even if the user redeems a code,
// the next request (after cache expiry) will see the updated status.
const subCache = new Map<string, { active: boolean; expiresAt: number }>();
const aiCache = new Map<string, { active: boolean; pool: AiKeyPool; expiresAt: number }>();
const SUB_CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Like getCurrentUserId, but throws UnauthorizedError if not authenticated.
 * Use this in protected API routes that require a logged-in user.
 *
 * By default it ALSO requires an active trial/licence, matching the promise
 * the client makes ("the API layer enforces access server-side"). Routes that
 * must stay reachable after a trial ends — redeem, subscription status,
 * licensing status, account/settings, PIN lock/unlock, and backup/export —
 * opt out with `{ requireActiveSubscription: false }`.
 *
 * Sets RLS context so database queries are scoped to this user.
 */
export async function requireUserId(
  req: NextRequest,
  options: { requireActiveSubscription?: boolean } = {},
): Promise<string> {
  const userId = await getCurrentUserId(req);
  if (!userId) {
    throw new UnauthorizedError("api.auth.required");
  }
  // Set RLS context so database queries are scoped to this user
  await setUserContext(userId);

  if (options.requireActiveSubscription === false) {
    return userId;
  }

  // Check subscription with in-memory cache (60s TTL)
  const cached = subCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    if (!cached.active) {
      throw new ForbiddenError("api.subscription.trialEnded");
    }
    return userId;
  }

  // Cache miss or expired — query the DB
  const isActive = await hasActiveAccess(userId);
  subCache.set(userId, { active: isActive, expiresAt: Date.now() + SUB_CACHE_TTL_MS });

  if (!isActive) {
    throw new ForbiddenError("api.subscription.trialEnded");
  }

  return userId;
}

/** Drop a user's cached entitlement after a redeem so access starts at once. */
export function invalidateActiveAccessCache(userId: string): void {
  subCache.delete(userId);
  aiCache.delete(userId);
}

/**
 * Require core access AND AI entitlement. Every AI route (voice assistant,
 * smart entry, Khata assistant, growth/insights narration) must use this.
 *
 * A permanent REGULAR licence (Rs 10,000 one-time) has core access but no AI:
 * it is rejected here with a clear "AI needs Premium" error. The check runs on
 * the server for every request, so hiding the UI button is not the control.
 */
export async function requireAiAccess(req: NextRequest): Promise<string> {
  const userId = await requireUserId(req); // core/trial licence still required

  const cached = aiCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    if (!cached.active) {
      throw new ForbiddenError("api.subscription.aiRequiresPremium");
    }
    // Bind the key pool for the rest of this request.
    setAiKeyPool(cached.pool);
    return userId;
  }

  const entitlement = await getEntitlement(userId);
  const allowed = aiAllowed(entitlement);
  // OWNER/AFFILIATE spend the owner key; PREMIUM/TRIAL spend the customer key.
  const pool = poolForCategory(entitlement.category);
  aiCache.set(userId, { active: allowed, pool, expiresAt: Date.now() + SUB_CACHE_TTL_MS });
  if (!allowed) {
    throw new ForbiddenError("api.subscription.aiRequiresPremium");
  }
  setAiKeyPool(pool);
  return userId;
}

/**
 * Backwards-compatible alias for {@link requireUserId}. The licensing check
 * now lives in requireUserId so every protected route enforces it by default.
 */
export async function requireActiveAccess(req: NextRequest): Promise<string> {
  return requireUserId(req);
}
