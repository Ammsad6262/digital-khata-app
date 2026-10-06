/**
 * POST /api/smart-entry/cancel
 *
 * Body: { sessionId: "..." }
 * Response: { ok: true, data: { id, cancelled: true } }
 *
 * Marks a Smart Entry session as CANCELLED. The user pressed Cancel on the
 * confirmation screen. Cannot cancel an already-completed session.
 */

import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { cancelSession } from "@/lib/smart-entry/service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const cancelRequestSchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) {
      throw new BadRequestError(error || "Invalid request body.");
    }
    const parsed = cancelRequestSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestError(
        `Invalid request: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      );
    }
    const result = await cancelSession(userId, parsed.data.sessionId);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
