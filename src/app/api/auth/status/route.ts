/**
 * GET /api/auth/status
 *
 * Returns whether a PIN is set and whether the current session is unlocked.
 * The client uses this to decide whether to show the PIN unlock screen.
 *
 * This route is PUBLIC (no session required) — it only reveals whether a PIN
 * exists, not the PIN itself.
 *
 * If the database connection fails, this route returns the ACTUAL error message
 * (not a generic 500) so the user can debug.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/services/settings";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
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
  } catch (error) {
    // Return the ACTUAL error message so the user can see what's wrong
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[auth/status] Error:", message);

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DATABASE_ERROR",
          message: `Database error: ${message}. Check DATABASE_URL env var.`,
        },
      },
      { status: 500 },
    );
  }
}
