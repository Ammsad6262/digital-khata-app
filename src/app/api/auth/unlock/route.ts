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
import { getSettings, getOwnerPinHash } from "@/lib/services/settings";
import { verifyPin } from "@/lib/auth/pin";
import { createSession } from "@/lib/auth/session";
import { checkRateLimit, recordFailure, recordSuccess, getClientIp } from "@/lib/auth/rate-limiter";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const unlockSchema = z.object({
  pin: z.string().max(6),
});

export async function POST(req: NextRequest) {
  try {
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
    const settings = await getSettings();

    // If no PIN is set, auto-grant session (app is unprotected)
    if (!settings.hasPin) {
      const { cookie } = await createSession();
      const res = NextResponse.json({ ok: true, data: { unlocked: true } });
      res.headers.set("Set-Cookie", cookie);
      return res;
    }

    // PIN is set — verify it
    const pinHash = await getOwnerPinHash();
    if (!pinHash) {
      // Race condition: PIN was cleared between getSettings and getOwnerPinHash
      const { cookie } = await createSession();
      const res = NextResponse.json({ ok: true, data: { unlocked: true } });
      res.headers.set("Set-Cookie", cookie);
      return res;
    }

    const valid = await verifyPin(parsed.pin, pinHash);
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
