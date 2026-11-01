/**
 * POST /api/assistant/cancel
 *
 * Cancels a prepared action that has not been confirmed yet. Only PENDING
 * actions can be cancelled, so a plan that already ran keeps its result.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { cancelAction } from "@/lib/assistant/service";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const { data: body } = await parseJsonBody<{ actionId?: unknown }>(req);
    const actionId = typeof body?.actionId === "string" ? body.actionId : "";
    if (!actionId) throw new BadRequestError("actionId is required.");
    const cancelled = await cancelAction(userId, actionId);
    return ok({ cancelled });
  } catch (error) {
    return fail(error);
  }
}
