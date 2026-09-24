/**
 * /api/dashboard/profit-loss
 *
 * GET → returns comprehensive Profit & Loss stats for 4 time periods:
 *   - today
 *   - thisWeek
 *   - thisMonth
 *   - allTime
 *
 * Each period includes:
 *   - revenue (total sales)
 *   - cogs (cost of goods sold)
 *   - grossProfit (revenue - cogs)
 *   - expenses (total business expenses)
 *   - netProfit (grossProfit - expenses)
 *   - profitMargin (netProfit / revenue × 100, 2 decimal places)
 *   - salesCount / expenseCount
 *
 * Used by the dashboard's Profit & Loss section.
 */

import { NextRequest } from "next/server";
import { getProfitLossStats } from "@/lib/services/profit-loss";
import { ok, fail } from "@/lib/utils/api";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId(req);
    const stats = await getProfitLossStats(userId);
    return ok(stats);
  } catch (error) {
    return fail(error);
  }
}
