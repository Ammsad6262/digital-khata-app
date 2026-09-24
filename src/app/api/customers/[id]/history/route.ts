import { NextRequest } from "next/server";
import { getCustomerHistory } from "@/lib/services/customers";
import { ok, fail } from "@/lib/utils/api";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId(req);
    const { id } = await params;
    const history = await getCustomerHistory(id, userId);
    return ok(history);
  } catch (error) {
    return fail(error);
  }
}
