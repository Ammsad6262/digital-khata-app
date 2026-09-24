import { NextRequest } from "next/server";
import { listProductBatches } from "@/lib/services/stock";
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
    const batches = await listProductBatches(id, userId);
    return ok(batches);
  } catch (error) {
    return fail(error);
  }
}
