/**
 * /api/settings/pin
 *
 * POST   → set or change the owner PIN. Body: { pin: "1234", currentPin?: "0000" }
 *          If a PIN is already set, requires currentPin for verification.
 * DELETE → remove the owner PIN (disables PIN lock). Body: { currentPin: "1234" }
 *
 * The PIN is hashed with bcrypt before storage. Never stored or returned in plaintext.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getOwnerPinHash, setOwnerPinHash, clearOwnerPinHash } from "@/lib/services/settings";
import { hashPin, verifyPin, isValidPinFormat } from "@/lib/auth/pin";
import { BadRequestError, UnauthorizedError } from "@/lib/errors";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

const setPinSchema = z.object({
  pin: z.string().min(4, "PIN must be at least 4 digits.").max(6, "PIN must be at most 6 digits."),
  currentPin: z.string().optional(),
});

const removePinSchema = z.object({
  currentPin: z.string().min(1, "Current PIN is required to remove PIN lock."),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = setPinSchema.parse(data);

    // Validate PIN format (digits only, 4-6 chars)
    if (!isValidPinFormat(parsed.pin)) {
      throw new BadRequestError("PIN must be 4-6 digits (numbers only).");
    }

    // If a PIN is already set, verify the current PIN before allowing change
    const existingHash = await getOwnerPinHash(userId);
    if (existingHash) {
      if (!parsed.currentPin) {
        throw new UnauthorizedError("Current PIN is required to change PIN.");
      }
      const valid = await verifyPin(parsed.currentPin, existingHash);
      if (!valid) {
        throw new UnauthorizedError("Current PIN is incorrect.");
      }
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
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = removePinSchema.parse(data);

    // Verify current PIN before removing
    const existingHash = await getOwnerPinHash(userId);
    if (!existingHash) {
      throw new BadRequestError("No PIN is set — nothing to remove.");
    }

    const valid = await verifyPin(parsed.currentPin, existingHash);
    if (!valid) {
      throw new UnauthorizedError("Current PIN is incorrect.");
    }

    await clearOwnerPinHash(userId);

    return ok({ hasPin: false });
  } catch (error) {
    return fail(error);
  }
}
