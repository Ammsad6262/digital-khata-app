import { NextRequest } from "next/server";
import { getSubscriptionStatus } from "@/lib/services/subscription";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const status = await getSubscriptionStatus(userId);
    return ok(status);
  } catch (error) {
    return fail(error);
  }
}
