/**
 * POST /api/auth/register
 * Body: { name, email, password }
 * Returns: { user, token } + sets httpOnly cookie
 */

import { NextRequest, NextResponse } from "next/server";
import { registerUser, AUTH_COOKIE_NAME } from "@/lib/services/auth";
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
  const rateKey = `register:${ip}`;
  // Separate counter for *successful* account creations. recordSuccess clears
  // the failure counter above, so a creation counter must not share its key.
  const creationKey = `register-created:${ip}`;

  try {
    // Prevent automated account-creation floods.
    const { locked, retryAfter } = checkRateLimit(rateKey);
    if (locked) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: tServer("api.auth.register.rateLimited", { seconds: retryAfter }),
            messageKey: "api.auth.register.rateLimited",
            translationKey: true,
            params: { seconds: retryAfter },
          },
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    // Cap how many accounts one address can create in the window.
    const creationLimit = checkRateLimit(creationKey);
    if (creationLimit.locked) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: tServer("api.auth.register.rateLimited", { seconds: creationLimit.retryAfter }),
            messageKey: "api.auth.register.rateLimited",
            translationKey: true,
            params: { seconds: creationLimit.retryAfter },
          },
        },
        { status: 429, headers: { "Retry-After": String(creationLimit.retryAfter) } },
      );
    }

    const { data, error } = await parseJsonBody<{
      name: string;
      email: string;
      password: string;
      plan?: "trial" | "paid";
    }>(req);
    if (error || !data) throw new BadRequestError(error || tServer("api.errors.invalidBody"));

    const result = await registerUser({
      ...data,
      plan: data.plan === "paid" ? "paid" : "trial",
    });

    recordSuccess(rateKey);
    // Count the account creation itself, so successes cannot reset the cap.
    recordFailure(creationKey);

    const res = ok({ user: result.user });
    // Set httpOnly cookie with the JWT token
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
