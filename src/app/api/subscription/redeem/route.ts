/**
 * POST /api/subscription/redeem
 *
 * Redeem an activation code. The server determines the duration —
 * the frontend only submits the code string.
 *
 * Rate limited: max 10 redemption attempts per 5 minutes per IP.
 *
 * Body: { code: string }
 * Returns: { success, durationDays, newAccessExpiresAt, previousAccessExpiresAt }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { redeemCode } from "@/lib/services/subscription";
import { requireUserId } from "@/lib/auth/get-current-user";
import { checkRateLimit, recordFailure, recordSuccess, getClientIp } from "@/lib/auth/rate-limiter";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const redeemSchema = z.object({
  code: z.string().min(1, "Please enter an activation code.").max(50, "Code is too long."),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const ip = getClientIp(req);

    // Rate limit: 10 attempts per 5 minutes
    const { locked, retryAfter } = checkRateLimit(ip);
    if (locked) {
      return ok(
        { error: "Too many attempts. Please wait a moment and try again." },
        429,
      );
    }

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = redeemSchema.parse(data);
    const result = await redeemCode(userId, parsed.code);

    recordSuccess(ip);
    return ok(result);
  } catch (error) {
    // Record failure for rate limiting
    const ip = getClientIp(req);
    recordFailure(ip);
    return fail(error);
  }
}
