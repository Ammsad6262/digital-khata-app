/**
 * /api/dashboard
 *
 * GET → aggregated stats for the dashboard home screen.
 * Protected by circuit breaker: if DB is slow/unreachable, returns cached
 * fallback (empty dashboard) instead of hanging.
 */

import { NextRequest } from "next/server";
import { getDashboardStats } from "@/lib/services/dashboard";
import { withCircuitBreaker, getCircuitBreakerState } from "@/lib/utils/circuit-breaker";
import { ok, fail } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

// Fallback: empty dashboard (no data, but doesn't crash the UI)
const FALLBACK_DASHBOARD = {
  totalReceivables: "0",
  customerCount: 0,
  customersWithBalance: 0,
  todaysSales: "0",
  todaysPayments: "0",
  todaysExpenses: "0",
  lowStockProducts: [],
  recentTransactions: [],
};

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);

    const cbState = getCircuitBreakerState();

    // If circuit is open, return fallback immediately
    if (cbState.state === "open") {
      return ok({
        ...FALLBACK_DASHBOARD,
        _circuitBreaker: "open",
        _message: "Database is temporarily unavailable. Showing cached data.",
      });
    }

    const data = await withCircuitBreaker(
      () => getDashboardStats(userId),
      FALLBACK_DASHBOARD,
      10000, // 10s timeout for the heaviest query
    );
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
