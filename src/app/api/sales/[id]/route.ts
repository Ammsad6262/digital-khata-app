import { NextRequest } from "next/server";
import { getSale, voidSale } from "@/lib/services/sales";
import { ok, fail } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { requireActiveAccess } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireActiveAccess(req);
    const { id } = await params;
    const sale = await getSale(id, userId);
    return ok(sale);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireActiveAccess(req);
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    if (action === "void") {
      const result = await voidSale(id, userId);
      return ok(result);
    }
    throw new BadRequestError("api.sale.unknownAction");
  } catch (error) {
    return fail(error);
  }
}
