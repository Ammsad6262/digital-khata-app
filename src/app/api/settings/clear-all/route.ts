/**
 * /api/settings/clear-all
 *
 * DELETE → wipes ALL business data (customers, products, sales, etc.)
 *          Keeps the Setting row (business name + currency + PIN).
 *
 * Body: { confirm: true, currentPin?: "1234" }
 *   - confirm must be true (double safety)
 *   - If a PIN is set, currentPin must be provided and verified
 *
 * Returns the count of deleted records per table.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clearAllData, getOwnerPinHash } from "@/lib/services/settings";
import { verifyPin } from "@/lib/auth/pin";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";
import { checkRateLimit, recordFailure, recordSuccess, getClientIp } from "@/lib/auth/rate-limiter";
import { tServer } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const clearSchema = z.object({
  confirm: z.boolean().refine((v) => v === true, {
    message: "api.clearAll.confirmRequired",
  }),
  currentPin: z.string().optional(),
});

export async function DELETE(req: NextRequest) {
  const ip = getClientIp(req);
  const rateKey = `pin:${ip}`;

  try {
    const { locked, retryAfter } = checkRateLimit(rateKey);
    if (locked) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: tServer("api.auth.unlock.rateLimited", { seconds: retryAfter }),
            messageKey: "api.auth.unlock.rateLimited",
            translationKey: true,
            params: { seconds: retryAfter },
          },
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = clearSchema.parse(data);

    // If a PIN is set, require it for this destructive action
    const existingHash = await getOwnerPinHash(userId);
    if (existingHash) {
      if (!parsed.currentPin) {
        throw new BadRequestError("api.clearAll.pinRequired");
      }
      const valid = await verifyPin(parsed.currentPin, existingHash);
      if (!valid) {
        recordFailure(rateKey);
        throw new BadRequestError("api.clearAll.pinIncorrect");
      }
      recordSuccess(rateKey);
    }

    const result = await clearAllData(userId);

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
