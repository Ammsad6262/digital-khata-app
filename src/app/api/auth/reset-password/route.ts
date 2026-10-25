/**
 * POST /api/auth/reset-password
 *
 * Public. Consumes an admin-issued reset code and sets a new password.
 *
 * Body: { email, code, newPassword }
 *
 * The response is deliberately generic for a wrong email, wrong code, expired
 * code, or already-used code. This endpoint must not become an account
 * enumeration oracle. IP rate limiting and the per-code attempt limit provide
 * the brute-force protection.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { resetPasswordWithCode } from "@/lib/services/password-reset";
import {
  checkRateLimit,
  getClientIp,
  recordFailure,
  recordSuccess,
} from "@/lib/auth/rate-limiter";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { tServer } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const resetSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "api.password.resetEmailRequired")
    .max(254)
    .email("api.password.resetEmailRequired"),
  code: z
    .string()
    .trim()
    .min(1, "api.password.resetCodeRequired")
    .max(50, "api.password.resetCodeRequired"),
  newPassword: z
    .string()
    .min(6, "api.password.tooShort")
    .max(200, "api.password.tooShort"),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Keep reset failures in their own bucket. A bad reset code must not lock the
  // owner out of PIN login or activation-code redemption from the same IP.
  const rateKey = `reset:${ip}`;

  try {
    const { locked, retryAfter } = checkRateLimit(rateKey);
    if (locked) {
      throw new BadRequestError("api.password.resetRateLimited", undefined, {
        seconds: retryAfter,
      });
    }

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) {
      throw new BadRequestError(
        error || tServer("api.errors.invalidBody"),
      );
    }

    const parsed = resetSchema.parse(data);
    const result = await resetPasswordWithCode(parsed);

    recordSuccess(rateKey);
    const res = ok(result);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    recordFailure(rateKey);
    return fail(error);
  }
}
