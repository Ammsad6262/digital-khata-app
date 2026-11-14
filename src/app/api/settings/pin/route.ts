/**
 * /api/settings/pin
 *
 * POST   → set or change the owner PIN. Body: { pin: "1234", currentPin?: "0000" }
 *          If a PIN is already set, requires currentPin for verification.
 * DELETE → remove the owner PIN (disables PIN lock). Body: { currentPin: "1234" }
 *
 * The PIN is hashed with bcrypt before storage. Never stored or returned in plaintext.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerPinHash, setOwnerPinHash, clearOwnerPinHash } from "@/lib/services/settings";
import { hashPin, verifyPin, isValidPinFormat } from "@/lib/auth/pin";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";
import { checkRateLimit, recordFailure, recordSuccess, getClientIp } from "@/lib/auth/rate-limiter";
import { tServer } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const setPinSchema = z.object({
  pin: z.string().min(4, "api.pin.tooShort").max(6, "api.pin.tooLong"),
  currentPin: z.string().optional(),
});

const removePinSchema = z.object({
  currentPin: z.string().min(1, "api.pin.currentRequiredToRemove"),
});

export async function POST(req: NextRequest) {
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

    const userId = await requireUserId(req, { requireActiveSubscription: false });
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = setPinSchema.parse(data);

    // Validate PIN format (digits only, 4-6 chars)
    if (!isValidPinFormat(parsed.pin)) {
      throw new BadRequestError("api.pin.invalidFormat");
    }

    // If a PIN is already set, verify the current PIN before allowing change
    const existingHash = await getOwnerPinHash(userId);
    if (existingHash) {
      if (!parsed.currentPin) {
        throw new UnauthorizedError("api.pin.currentRequiredToChange");
      }
      const valid = await verifyPin(parsed.currentPin, existingHash);
      if (!valid) {
        recordFailure(rateKey);
        throw new UnauthorizedError("api.pin.incorrectCurrent");
      }
      recordSuccess(rateKey);
    }

    // Hash + store the new PIN
    const hash = await hashPin(parsed.pin);
    await setOwnerPinHash(userId, hash);

    return ok({ hasPin: true });
  } catch (error) {
    return fail(error);
  }
}

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

    const userId = await requireUserId(req, { requireActiveSubscription: false });
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = removePinSchema.parse(data);

    // Verify current PIN before removing
    const existingHash = await getOwnerPinHash(userId);
    if (!existingHash) {
      throw new BadRequestError("api.pin.noneSet");
    }

    const valid = await verifyPin(parsed.currentPin, existingHash);
    if (!valid) {
      recordFailure(rateKey);
      throw new UnauthorizedError("api.pin.incorrectCurrent");
    }
    recordSuccess(rateKey);

    await clearOwnerPinHash(userId);

    return ok({ hasPin: false });
  } catch (error) {
    return fail(error);
  }
}
