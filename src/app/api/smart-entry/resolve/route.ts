/**
 * POST /api/smart-entry/resolve
 *
 * Body:
 *   { sessionId: "...", chosenCustomerId: "..." }   (for ambiguous_customer)
 *   { sessionId: "...", chosenProductId: "..." }    (for ambiguous_product)
 *
 * Response:
 *   { ok: true, data: InterpretResult }
 *
 * This endpoint resolves a disambiguation choice and returns the
 * CONFIRMATION PREVIEW — it does NOT execute the sale. The user must
 * then call /api/smart-entry/execute to actually create the transaction.
 *
 * This is the proper UX flow per the spec:
 *   1. User says "Ahmad ne 25 kilo chawal liya"
 *   2. Multiple Ahmads → /interpret returns status=AMBIGUOUS_CUSTOMER + picker
 *   3. User picks one Ahmad → POST /resolve with chosenCustomerId
 *   4. /resolve returns status=READY + preview (Ahmad Khan, Rice, 25 kg, Rs. XXX)
 *   5. User clicks "Add to Khata" → POST /execute (no chosenCustomerId needed
 *      — the session now has resolvedCustomerId set)
 *
 * Security: same as execute — userId derived from JWT cookie, chosen IDs
 * re-validated against the user's records.
 */

import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { resolveDisambiguation } from "@/lib/smart-entry/service";
import { checkExecuteLimit } from "@/lib/smart-entry/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const resolveRequestSchema = z.object({
  sessionId: z.string().min(1),
  chosenCustomerId: z.string().min(1).optional(),
  chosenProductId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    // Use the execute rate limit bucket (resolves are cheap but we cap anyway)
    const limit = checkExecuteLimit(userId);
    if (!limit.allowed) {
      throw new BadRequestError(
        `Too many requests. Try again in ${limit.retryAfterSec}s.`,
      );
    }

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) {
      throw new BadRequestError(error || "Invalid request body.");
    }

    const parsed = resolveRequestSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestError(
        `Invalid request: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      );
    }

    const result = await resolveDisambiguation(userId, parsed.data.sessionId, {
      customerId: parsed.data.chosenCustomerId,
      productId: parsed.data.chosenProductId,
    });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
