/**
 * POST /api/auth/lock
 *
 * Clears the PIN session cookie (manual lock).
 * No body required.
 *
 * Requires a valid account session (enforced by middleware and again here so
 * the route stays protected if the middleware matcher ever changes).
 */

import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { requireUserId } from "@/lib/auth/get-current-user";
import { fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireUserId(req, { requireActiveSubscription: false });
    const res = NextResponse.json({ ok: true, data: { locked: true } });
    res.headers.set("Set-Cookie", clearSessionCookie());
    return res;
  } catch (error) {
    return fail(error);
  }
}