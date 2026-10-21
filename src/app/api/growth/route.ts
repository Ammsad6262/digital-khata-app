/**
 * /api/growth
 *
 * GET → deterministic growth recommendations for the authenticated business.
 * Every figure comes from that business's own records.
 */

import { NextRequest } from "next/server";
import { getGrowthPlan } from "@/lib/services/growth";
import { ok, fail } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const data = await getGrowthPlan(userId);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
