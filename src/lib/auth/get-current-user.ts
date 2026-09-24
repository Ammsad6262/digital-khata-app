/**
 * Helper to get the current authenticated user's ID from a NextRequest.
 *
 * The middleware (src/middleware.ts) verifies the JWT and injects the userId
 * into the `x-user-id` request header. This function reads that header.
 *
 * If the header is missing (e.g., route was not covered by middleware, or
 * called from a non-request context), it falls back to verifying the JWT
 * cookie directly.
 *
 * Returns null if not logged in. Existing data with null userId is visible
 * to all users (backward compat for pre-auth data).
 */

import { NextRequest } from "next/server";
import { verifyToken, getUserById, AUTH_COOKIE_NAME } from "@/lib/services/auth";

export async function getCurrentUserId(req: NextRequest): Promise<string | null> {
  // Fast path: middleware already verified the JWT and injected the userId
  const headerUserId = req.headers.get("x-user-id");
  if (headerUserId) {
    return headerUserId;
  }

  // Fallback: verify the JWT cookie directly (for routes that might bypass middleware)
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = await verifyToken(token);
    if (!payload) return null;

    // Verify the user still exists
    const user = await getUserById(payload.userId);
    if (!user) return null;

    return payload.userId;
  } catch {
    return null;
  }
}
