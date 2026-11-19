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
import {
  isEmailVerificationEnforced,
  issueVerificationCode,
} from "@/lib/services/email-verification";
import { buildVerificationEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send-email";
import { isMobileClient } from "@/lib/auth/client-kind";

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

    // Verification is BEST-EFFORT: the account already exists, so a provider
    // outage must never turn a successful sign-up into an error. The user can
    // always resend from /verify-email (or verify voluntarily later).
    let verificationSent = false;
    try {
      const issued = await issueVerificationCode(result.user.id);
      const content = buildVerificationEmail({
        name: issued.user.name,
        code: issued.code,
        expiresInMinutes: 10,
      });
      const delivery = await sendEmail({
        to: issued.user.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
        template: "email-verification",
      });
      verificationSent = delivery.sent;
    } catch (error) {
      // Never log the code (it is not in the error) and never rethrow.
      console.error(
        "[register] verification email skipped:",
        error instanceof Error ? error.name : "unknown",
      );
    }

    const res = ok({
      user: result.user,
      // False when this mailbox already used its trial; the client sends the
      // owner to /more/redeem instead of the dashboard.
      trialGranted: result.trialGranted,
      emailVerificationEnforced: isEmailVerificationEnforced(),
      verificationSent,
      // See login/route.ts: only the app gets the token in the body.
      ...(isMobileClient(req) ? { token: result.token } : {}),
    });
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
