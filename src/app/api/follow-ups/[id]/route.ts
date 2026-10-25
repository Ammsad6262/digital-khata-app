/**
 * PATCH /api/follow-ups/[id]
 *
 * Edit the prepared message, or record what actually happened
 * (contacted / interested / order placed / not interested / no response).
 */

import { NextRequest } from "next/server";
import { updateFollowUp } from "@/lib/services/follow-ups";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const followUp = await updateFollowUp(id, data as never, userId);
    return ok(followUp);
  } catch (error) {
    return fail(error);
  }
}
