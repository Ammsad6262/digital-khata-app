/**
 * GET /api/subscription
 *
 * Returns the current user's subscription/access status.
 * Used by the frontend to determine whether to show the subscription page,
 * the expired trial screen, or normal app access.
 */

import { NextRequest } from "next/server";
import { getSubscriptionStatus } from "@/lib/services/subscription";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const status = await getSubscriptionStatus(userId);
    return ok(status);
  } catch (error) {
    return fail(error);
  }
}
