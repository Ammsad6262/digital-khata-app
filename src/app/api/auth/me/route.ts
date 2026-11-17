/**
 * GET /api/auth/me
 * Returns the current logged-in user's profile (or null if not logged in).
 * This route is public — it just returns null if no valid token.
 *
 * `emailVerificationEnforced` is reported alongside the user because the flag
 * is a server-only env var: a client component cannot read
 * `EMAIL_VERIFICATION_ENFORCED` from `process.env`, so the client asks here.
 */

import { NextRequest } from "next/server";
import { verifyToken, getUserById, AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { isEmailVerificationEnforced } from "@/lib/services/email-verification";
import { ok } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let user = null;
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const payload = await verifyToken(token);
      if (payload) user = await getUserById(payload.userId);
    }
  } catch {
    user = null;
  }

  // Never let a shared cache store this — it contains the signed-in user's PII.
  const res = ok({ user, emailVerificationEnforced: isEmailVerificationEnforced() });
  res.headers.set("Cache-Control", "no-store");
  return res;
}