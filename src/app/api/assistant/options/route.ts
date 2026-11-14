/**
 * GET /api/assistant/options
 *
 * Feeds the confirmation card's customer/product/supplier pickers with the
 * owner's own records. Without this, the only way to change an entity was to
 * retype its name, which is slow on a phone and easy to misspell.
 *
 * Returns at most 300 of each, alphabetically. Scoped to the signed-in user.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail } from "@/lib/utils/api";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);

    const [customers, products, suppliers] = await Promise.all([
      prisma.customer.findMany({
        where: { userId, isDeleted: false },
        select: { id: true, name: true, phone: true },
        orderBy: { name: "asc" },
        take: 300,
      }),
      prisma.product.findMany({
        where: { userId, isDeleted: false },
        select: {
          id: true,
          name: true,
          unit: true,
          sellingPrice: true,
          purchasePrice: true,
        },
        orderBy: { name: "asc" },
        take: 300,
      }),
      prisma.supplier.findMany({
        where: { userId, isDeleted: false },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 300,
      }),
    ]);

    return ok({ customers, products, suppliers });
  } catch (error) {
    return fail(error);
  }
}
