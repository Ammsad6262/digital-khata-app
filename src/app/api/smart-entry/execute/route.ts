/**
 * POST /api/smart-entry/execute
 *
 * Body:
 *   { sessionId: "..." }
 *   OR (for disambiguation flow):
 *   { sessionId: "...", chosenCustomerId: "..." }
 *   { sessionId: "...", chosenProductId: "..." }
 *
 * Response:
 *   { ok: true, data: { saleId, totalAmount, outstanding } }
 *
 * SECURITY:
 *   - userId derived from JWT cookie (NEVER from body)
 *   - sessionId verified to belong to this user
 *   - chosenCustomerId / chosenProductId RE-VALIDATED against this user's records
 *   - The client CANNOT inject amount, customer ID, or product ID — those
 *     come from the server-side SmartEntrySession row.
 *   - Amount is recomputed using the CURRENT product.sellingPrice (defends
 *     against price changes since interpret)
 *   - Customer/product are re-verified to still exist (defends against deletion)
 *   - Calls existing SaleService.createSale() — the same trusted path as the
 *     manual sale form.
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

    // Rate limit (executions are cheap but we still cap)
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

    const result = await executeSession(userId, parsed.data.sessionId, {
      customerId: parsed.data.chosenCustomerId,
      productId: parsed.data.chosenProductId,
    });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
