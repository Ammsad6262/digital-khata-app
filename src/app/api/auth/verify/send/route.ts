/**
 * POST /api/auth/verify/send
 *
 * Issues a fresh 6-digit code and emails it. The plaintext code is NEVER
 * returned to the client — it only travels to the provider.
 *
 * Protected but available without an active subscription: an account that is
 * verifying its address must not be blocked by a paywall.
 *
 * Rate limiting is layered:
 *   - the in-memory limiter (separate keys for the account and the IP),
 *   - the service's 60-second cooldown,
 *   - the service's rolling 24-hour send cap.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { checkRateLimit, getClientIp, recordFailure } from "@/lib/auth/rate-limiter";
import { fail } from "@/lib/utils/api";
import { tServer } from "@/lib/i18n/server";
import {
  EmailVerificationCooldownError,
  EmailVerificationDailyLimitError,
  RESEND_COOLDOWN_SECONDS,
  issueVerificationCode,
} from "@/lib/services/email-verification";
import { buildVerificationEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send-email";

export const dynamic = "force-dynamic";

type RateLimitError = EmailVerificationCooldownError | EmailVerificationDailyLimitError;

function tooManyRequests(error: RateLimitError): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: tServer(error.message, error.params),
        messageKey: error.message,
        translationKey: true,
        params: error.params,
        retryAfter: error.retryAfter,
      },
    },
    { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
  );
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const userId = await requireUserId(req, { requireActiveSubscription: false });

    const userKey = `verify-send:user:${userId}`;
    const ipKey = `verify-send:ip:${ip}`;

    for (const key of [userKey, ipKey]) {
      const { locked, retryAfter } = checkRateLimit(key);
      if (locked) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "RATE_LIMITED",
              message: tServer("api.verify.rateLimited", { seconds: retryAfter }),
              messageKey: "api.verify.rateLimited",
              translationKey: true,
              params: { seconds: retryAfter },
              retryAfter,
            },
          },
          { status: 429, headers: { "Retry-After": String(retryAfter) } },
        );
      }
    }

    const issued = await issueVerificationCode(userId);

    // Count this send on both keys. `checkRateLimit` counts generic attempts;
    // like the register route's creation counter, the send itself is the hit.
    recordFailure(userKey);
    recordFailure(ipKey);

    const content = buildVerificationEmail({
      name: issued.user.name,
      code: issued.code,
      expiresInMinutes: 10,
    });

    // Best-effort: a provider failure must not turn into a 500. The response
    // tells the UI whether the mail actually left, so it can offer a retry.
    const delivery = await sendEmail({
      to: issued.user.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
      template: "email-verification",
    });

    return NextResponse.json({
      ok: true,
      expiresAt: issued.expiresAt.toISOString(),
      cooldownSeconds: RESEND_COOLDOWN_SECONDS,
      sent: delivery.sent,
      provider: delivery.provider,
    });
  } catch (error) {
    if (
      error instanceof EmailVerificationCooldownError ||
      error instanceof EmailVerificationDailyLimitError
    ) {
      return tooManyRequests(error);
    }
    return fail(error);
  }
}