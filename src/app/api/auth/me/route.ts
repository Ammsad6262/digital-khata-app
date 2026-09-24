/**
 * GET /api/auth/me
 * Returns the current logged-in user's profile (or null if not logged in).
 * This route is public — it just returns null if no valid token.
 */

import { NextRequest } from "next/server";
import { verifyToken, getUserById, AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { ok } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return ok({ user: null });

    const payload = await verifyToken(token);
    if (!payload) return ok({ user: null });

    const user = await getUserById(payload.userId);
    if (!user) return ok({ user: null });

    return ok({ user });
  } catch {
    return ok({ user: null });
  }
}
