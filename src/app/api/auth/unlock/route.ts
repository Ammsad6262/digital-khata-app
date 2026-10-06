/**
 * POST /api/auth/unlock
 *
 * Verifies the PIN and creates a session.
 *
 * Body: { pin: string }
 *
 * If no PIN is set in the DB → auto-grants a session (the app is unprotected).
 * If a PIN is set → verifies the PIN with bcrypt, creates a session on success.
 *
 * Rate-limited: 5 failed attempts per 5 minutes → 5-minute lockout.
 *
 * Returns: { unlocked: true } + sets HttpOnly session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerPinHash } from "@/lib/services/settings";
import { verifyPin } from "@/lib/auth/pin";
import { createSession } from "@/lib/auth/session";
import { checkRateLimit, recordFailure, recordSuccess, getClientIp } from "@/lib/auth/rate-limiter";
import { fail } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

const unlockSchema = z.object({
  pin: z.string().max(6),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const ip = getClientIp(req);

    // Check rate limit
    const { locked, retryAfter } = checkRateLimit(ip);
    if (locked) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: `Too many failed attempts. Try again in ${retryAfter} seconds.`,
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        },
      );
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = unlockSchema.parse(body);

    // If no PIN is set for this user, auto-grant session (app is unprotected)
    const pinHash = await getOwnerPinHash(userId);
    if (!pinHash) {
      const { cookie } = await createSession();
      const res = NextResponse.json({ ok: true, data: { unlocked: true } });
      res.headers.set("Set-Cookie", cookie);
      return res;
    }

    // PIN is set — verify it (re-fetch to handle race condition)
    const currentPinHash = await getOwnerPinHash(userId);
    if (!currentPinHash) {
      // Race condition: PIN was cleared between checks
      const { cookie } = await createSession();
      const res = NextResponse.json({ ok: true, data: { unlocked: true } });
      res.headers.set("Set-Cookie", cookie);
      return res;
    }

    const valid = await verifyPin(parsed.pin, currentPinHash);
    if (!valid) {
      recordFailure(ip);
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Incorrect PIN.",
          },
        },
        { status: 401 },
      );
    }

    // Success — create session
    recordSuccess(ip);
    const { cookie } = await createSession();
    const res = NextResponse.json({ ok: true, data: { unlocked: true } });
    res.headers.set("Set-Cookie", cookie);
    return res;
  } catch (error) {
    return fail(error);
  }
}
