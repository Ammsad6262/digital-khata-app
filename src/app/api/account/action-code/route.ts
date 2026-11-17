/**
 * POST /api/account/action-code
 *
 * Step-up confirmation for a destructive account action. Emails a 6-digit code
 * to the owner's address and returns a signed token that carries
 * `{ userId, action, hash(code), expiry }`.
 *
 * The code itself never comes back to the client — only the inbox has it. The
 * token is what the destructive request sends back together with the typed code;
 * `verifyActionToken` then checks signature, expiry, action and code.
 *
 * Nothing is written to the database, so this cannot interfere with the actions
 * it guards (clearing data, deleting the account) and needs no migration.
 */

import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { checkRateLimit, getClientIp, recordFailure } from "@/lib/auth/rate-limiter";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { AppError, BadRequestError, ErrorCode, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { buildActionConfirmationEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send-email";
import {
  ACTION_CODE_TTL_MS,
  createActionToken,
  generateActionCode,
  isConfirmableAction,
  maskEmail,
} from "@/lib/account/action-confirmation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Body = { action?: unknown };

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const userId = await requireUserId(req, { requireActiveSubscription: false });

    const { data } = await parseJsonBody<Body>(req);
    const action = data?.action;
    if (!isConfirmableAction(action)) {
      throw new BadRequestError("api.account.actionInvalid");
    }

    // Two keys, like the verification sender: one per account, one per IP, so
    // neither a single user nor a shared connection can be mail-bombed.
    const userKey = `action-code:user:${userId}`;
    const ipKey = `action-code:ip:${ip}`;
    for (const key of [userKey, ipKey]) {
      const { locked, retryAfter } = checkRateLimit(key);
      if (locked) {
        throw new AppError(
          "api.account.actionRateLimited",
          ErrorCode.BAD_REQUEST,
          429,
          undefined,
          { seconds: retryAfter },
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) throw new NotFoundError("api.resource.user");

    const expiresInMinutes = Math.round(ACTION_CODE_TTL_MS / 60_000);
    const code = generateActionCode();
    const token = createActionToken(userId, action, code);

    // The send counts as the hit, same as the verification route.
    recordFailure(userKey);
    recordFailure(ipKey);

    const content = buildActionConfirmationEmail({
      name: user.name,
      code,
      action,
      expiresInMinutes,
    });

    // Best-effort, exactly like verification: a provider hiccup must not turn
    // into a 500, and the UI is told whether the mail actually left.
    const delivery = await sendEmail({
      to: user.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
      template: `action-${action}`,
    });

    return ok({
      token,
      email: maskEmail(user.email),
      expiresInMinutes,
      sent: delivery.sent,
    });
  } catch (error) {
    return fail(error);
  }
}