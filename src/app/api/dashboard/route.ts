/**
 * /api/dashboard
 *
 * GET → aggregated stats for the dashboard home screen.
 */

import { NextRequest } from "next/server";
import { getDashboardStats } from "@/lib/services/dashboard";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const data = await getDashboardStats();
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
