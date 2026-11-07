/**
 * GET /api/auth/me
 * Returns the current logged-in user's profile (or null if not logged in).
 * This route is public — it just returns null if no valid token.
 */

import { NextRequest } from "next/server";
import { verifyToken, getUserById, AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { getDevAutoLoginUser } from "@/lib/auth/dev-auto-login";
import { ok } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        const user = await getUserById(payload.userId);
        if (user) return ok({ user });
      }
    }

    // LOCAL DEV ONLY: report the auto-login account as signed in so the
    // client AuthGate does not redirect to /login. Returns null in production.
    const devUser = await getDevAutoLoginUser();
    return ok({ user: devUser });
  } catch {
    return ok({ user: null });
  }
}
