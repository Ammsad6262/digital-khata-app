/**
 * /api/insights
 *
 * GET → evidence-based business insights for the authenticated business.
 * Every number is computed from that business's own records.
 */

import { NextRequest } from "next/server";
import { getBusinessInsights } from "@/lib/services/insights";
import { ok, fail } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const data = await getBusinessInsights(userId);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
