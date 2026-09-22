/**
 * /api/customers/[id]/history
 *
 * GET → fetch one customer with their complete transaction history.
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { NextRequest } from "next/server";
import { getCustomerHistory } from "@/lib/services/customers";
import { ok, fail } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const history = await getCustomerHistory(id);
    return ok(history);
  } catch (error) {
    return fail(error);
  }
}
