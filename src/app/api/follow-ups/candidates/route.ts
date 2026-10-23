/**
 * /api/follow-ups/candidates — customers worth calling today.
 *
 * Derived from real purchase dates only: a customer is surfaced when they are
 * meaningfully past their own usual buying interval.
 */

import { NextRequest } from "next/server";
import { getFollowUpCandidates } from "@/lib/services/follow-ups";
import { ok, fail } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const items = await getFollowUpCandidates(userId);
    return ok({ items });
  } catch (error) {
    return fail(error);
  }
}
