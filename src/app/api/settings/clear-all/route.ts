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

import { NextRequest } from "next/server";
import { z } from "zod";
import { clearAllData, getOwnerPinHash } from "@/lib/services/settings";
import { verifyPin } from "@/lib/auth/pin";
import { UnauthorizedError } from "@/lib/errors";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const clearSchema = z.object({
  confirm: z.boolean().refine((v) => v === true, {
    message: "confirm must be true to clear all data.",
  }),
  currentPin: z.string().optional(),
});

export async function DELETE(req: NextRequest) {
  try {
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = clearSchema.parse(data);

    // If a PIN is set, require it for this destructive action
    const existingHash = await getOwnerPinHash();
    if (existingHash) {
      if (!parsed.currentPin) {
        throw new UnauthorizedError("PIN is required to clear all data.");
      }
      const valid = await verifyPin(parsed.currentPin, existingHash);
      if (!valid) {
        throw new UnauthorizedError("PIN is incorrect.");
      }
    }

    const result = await clearAllData();

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
