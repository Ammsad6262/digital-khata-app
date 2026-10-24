/**
 * /api/audit
 *
 * GET → the signed-in owner's most recent audit rows.
 *
 * Scoped to the authenticated user in the service. No cross-account access.
 * This is a core record, not an AI feature, so it does not require a paid
 * entitlement.
 */

import { NextRequest } from "next/server";
import { listAuditLogs } from "@/lib/services/audit";
import { ok, fail } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const items = await listAuditLogs(userId);
    return ok({ items });
  } catch (error) {
    return fail(error);
  }
}
