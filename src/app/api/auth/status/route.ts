/**
 * GET /api/auth/status
 *
 * Returns whether a PIN is set and whether the current session is unlocked.
 * The client uses this to decide whether to show the PIN unlock screen.
 *
 * This route is PUBLIC (no session required) — it only reveals whether a PIN
 * exists, not the PIN itself.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/services/settings";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const settings = await getSettings();
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const unlocked = !settings.hasPin || verifySession(sessionCookie);

  return NextResponse.json({
    ok: true,
    data: {
      hasPin: settings.hasPin,
      unlocked,
      businessName: settings.businessName,
    },
  });
}
