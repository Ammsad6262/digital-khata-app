import { NextRequest } from "next/server";
import { getRedemptionHistory } from "@/lib/services/subscription";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req, { requireActiveSubscription: false });
    const history = await getRedemptionHistory(userId);
    return ok(history);
  } catch (error) {
    return fail(error);
  }
}
