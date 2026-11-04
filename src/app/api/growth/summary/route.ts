/**
 * /api/growth/summary
 *
 * POST → AI narration of the deterministic growth plan.
 *
 * The model may only re-word facts that already exist. Any number it writes
 * that is not in the fact sheet is rejected and the deterministic summary is
 * returned instead, so the user never sees an invented figure.
 */

import { NextRequest } from "next/server";
import { narrateGrowthPlan } from "@/lib/services/growth-narration";
import { ok, fail } from "@/lib/utils/api";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const body = (await req.json().catch(() => ({}))) as { lang?: unknown };
    const lang =
      body.lang === "ur" || req.nextUrl.searchParams.get("lang") === "ur" ? "ur" : "en";
    const data = await narrateGrowthPlan(userId, lang);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
