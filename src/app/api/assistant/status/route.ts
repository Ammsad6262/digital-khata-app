/**
 * GET /api/assistant/status
 *
 * Reports one user-facing fact: whether the free AI can still answer today, and
 * if not, roughly when it will. No model names, no counters, no provider detail.
 * Developer diagnostics live at `/api/admin/diagnostics`.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail } from "@/lib/utils/api";
import { getAssistantStatus } from "@/lib/assistant/service";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    await requireActiveAccess(req);
    const status = await getAssistantStatus();
    return ok(status);
  } catch (error) {
    return fail(error);
  }
}
