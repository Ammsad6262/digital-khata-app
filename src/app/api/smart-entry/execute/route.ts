/**
 * POST /api/smart-entry/execute
 *
 * V2 body:
 *   { sessionId, customerId, productId, quantity }
 *
 * The client sends the FINAL form values after the user reviews/edits.
 * The backend RE-VALIDATES everything server-side — never trusts client values:
 *   - sessionId belongs to authenticated user
 *   - session is in AWAITING_CONFIRMATION state, not expired
 *   - customerId belongs to authenticated user, not deleted
 *   - productId belongs to authenticated user, not deleted
 *   - quantity is positive
 *   - unitPrice fetched from product (NEVER from client)
 *   - amount computed server-side: quantity × unitPrice
 *
 * Then calls existing SaleService.createSale() — the same trusted path as the
 * manual sale form.
 */

import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { executeSession } from "@/lib/smart-entry/service";
import { checkExecuteLimit } from "@/lib/smart-entry/rate-limit";
import { executeRequestSchema } from "@/lib/smart-entry/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);

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

    const parsed = executeRequestSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestError(
        `Invalid request: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      );
    }

    const result = await executeSession(userId, parsed.data);

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
