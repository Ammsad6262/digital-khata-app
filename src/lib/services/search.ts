/**
 * Search service layer.
 *
 * Powers the global search box on the dashboard. Searches customers by
 * name/phone and products by name/SKU. Returns a unified result list.
 */

import { prisma } from "@/lib/db/prisma";

export type SearchResult = {
  customers: Array<{ id: string; name: string; phone: string }>;
  products: Array<{ id: string; name: string; sku: string | null }>;
};

export async function search(query: string): Promise<SearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { customers: [], products: [] };
  }

  // Use Prisma's `contains` with case-insensitive matching.
  // SQLite supports case-insensitive `LIKE` natively for ASCII.
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({
      where: {
        isDeleted: false,
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
        ],
      },
      select: { id: true, name: true, phone: true },
      take: 20,
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: {
        isDeleted: false,
        OR: [
          { name: { contains: q } },
          ...(q.length > 0 ? [{ sku: { contains: q } }] : []),
        ],
      },
      select: { id: true, name: true, sku: true },
      take: 20,
      orderBy: { name: "asc" },
    }),
  ]);

  return { customers, products };
}
