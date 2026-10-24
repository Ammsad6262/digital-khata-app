/**
 * /api/reports
 *
 * GET ?preset=month&timezone=Asia/Karachi
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&timezone=Asia/Karachi
 *
 * Financial report for one date window: sales billed, cash received,
 * purchases, expenses, cost of goods, profit estimate, receivables/payables
 * as of now, top products, and the limitations that apply to the numbers.
 */

import { NextRequest } from "next/server";
import { getReportForRange, getReportForPreset } from "@/lib/services/reports";
import { ok, fail, getQueryParam } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const timezone = getQueryParam(req, "timezone") ?? "Asia/Karachi";
    const preset = getQueryParam(req, "preset");

    const data = preset
      ? await getReportForPreset(userId, preset, timezone)
      : await getReportForRange(
          userId,
          getQueryParam(req, "from"),
          getQueryParam(req, "to"),
          timezone,
        );
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
