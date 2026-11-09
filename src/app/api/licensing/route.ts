import { NextRequest } from "next/server";
import { getEntitlement } from "@/lib/services/entitlement";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/licensing
 *
 * The authenticated customer's authoritative commercial entitlement:
 * category, core access, premium status/expiry, owner/affiliate flags.
 * Computed on the server from the database — never trusted from the client.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const entitlement = await getEntitlement(userId);
    return ok(entitlement);
  } catch (error) {
    return fail(error);
  }
}