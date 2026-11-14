/**
 * POST /api/assistant/confirm
 *
 * Executes a prepared action after the user confirms it.
 *
 * Body:
 *   {
 *     actionId: "cuid",
 *     patch?: { paidAmount?: 15000, customerId?: "...", productId?: "..." }
 *   }
 *
 * `patch` lets the confirmation card fill in what the spoken command left out
 * (for example the paid amount) without re-running the AI.
 *
 * Guarantees:
 *   - the action must belong to the signed-in user,
 *   - a DONE action returns its stored result instead of executing again,
 *   - a conditional status transition prevents a double execution.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { confirmAction, toPublicReply } from "@/lib/assistant/service";
import { sanitizePatch } from "@/lib/assistant/patch";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Body = {
  actionId?: unknown;
  patch?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const { data: body } = await parseJsonBody<Body>(req);
    if (!body) throw new BadRequestError("A request body is required.");

    const actionId = typeof body.actionId === "string" ? body.actionId : "";
    if (!actionId) throw new BadRequestError("actionId is required.");

    const patch = sanitizePatch(body.patch);

    const reply = await confirmAction(userId, actionId, patch);
    return ok(toPublicReply(reply));
  } catch (error) {
    return fail(error);
  }
}
