/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { user } + sets httpOnly cookie with JWT
 */

import { NextRequest, NextResponse } from "next/server";
import { loginUser, AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { tServer } from "@/lib/i18n/server";
import {
  checkRateLimit,
  getClientIp,
  recordFailure,
  recordSuccess,
} from "@/lib/auth/rate-limiter";
import { BadRequestError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateKey = `login:${ip}`;

  try {
    // Brute-force protection: 5 failed logins per IP per 5 minutes.
    const { locked, retryAfter } = checkRateLimit(rateKey);
    if (locked) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: tServer("api.auth.login.rateLimited", { seconds: retryAfter }),
            messageKey: "api.auth.login.rateLimited",
            translationKey: true,
            params: { seconds: retryAfter },
          },
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const { data, error } = await parseJsonBody<{ email: string; password: string }>(req);
    if (error || !data) throw new BadRequestError(error || tServer("api.errors.invalidBody"));

    const result = await loginUser(data);

    recordSuccess(rateKey);

    const res = ok({ user: result.user });
    res.cookies.set(AUTH_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return res;
  } catch (error) {
    recordFailure(rateKey);
    return fail(error);
  }
}
