/**
 * GET /api/auth/status
 *
 * Returns whether a PIN is set and whether the current session is unlocked.
 * The client uses this to decide whether to show the PIN unlock screen.
 *
 * This route is PUBLIC (listed in PUBLIC_ROUTES in middleware) — it doesn't
 * require authentication. But it tries to read the JWT cookie to determine
 * the userId (for per-user PIN status). If no JWT is present, it returns
 * hasPin=false (no PIN lock).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getCurrentUserId } from "@/lib/auth/get-current-user";
import { getOwnerPinHash } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Try to derive userId from JWT (returns null if not logged in)
    const userId = await getCurrentUserId(req);

    // Default: no PIN, unlocked
    let hasPin = false;
    let businessName: string | null = null;

    if (userId) {
      const pinHash = await getOwnerPinHash(userId);
      hasPin = !!pinHash;
    }

    const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const unlocked = !hasPin || await verifySession(sessionCookie);

    return NextResponse.json(
      {
        ok: true,
        data: {
          hasPin,
          unlocked,
          businessName,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
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
