/**
 * GET /api/assistant/status
 *
 * Reports how much of today's free AI budget is left and what the assistant
 * remembers. Used by the UI to show "AI requests left today" and to explain an
 * exhausted state honestly instead of saying the assistant is broken.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail } from "@/lib/utils/api";
import { getAssistantStatus } from "@/lib/assistant/service";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const status = await getAssistantStatus(userId);
    return ok(status);
  } catch (error) {
    return fail(error);
  }
}
