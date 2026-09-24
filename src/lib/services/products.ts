/**
 * Product service layer.
 *
 * Single source of truth for product CRUD and stock calculation.
 *
 * Stock is DERIVED — it's never stored as a "current stock" column on Product.
 * Formula:
 *
 *   openingStock
 *   + SUM(stockMove.quantity     WHERE voidedAt IS NULL)  // signed: purchases +, adjustments ±
 *   - SUM(saleItem.quantity       WHERE sale.voidedAt IS NULL)
 *   = current stock
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { NotFoundError } from "@/lib/errors";
import { createProductSchema, updateProductSchema } from "@/lib/schemas/product";
import { cached, invalidateCache } from "@/lib/utils/cache";
import type { Prisma } from "@prisma/client";

export type ProductView = {
  id: string;
  name: string;
  category: string | null;
  purchasePrice: string;
  sellingPrice: string;
  unit: string;
  sku: string | null;
  openingStock: string;
  lowStockThreshold: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductWithStock = ProductView & {
  currentStock: string;
  isLowStock: boolean;
};

function toView(p: Prisma.ProductGetPayload<{}>): ProductView {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    purchasePrice: p.purchasePrice.toString(),
    sellingPrice: p.sellingPrice.toString(),
    unit: p.unit,
    sku: p.sku,
    openingStock: p.openingStock.toString(),
    lowStockThreshold: p.lowStockThreshold,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** List all active products. */
export async function listProducts(userId?: string | null): Promise<ProductView[]> {
  const products = await prisma.product.findMany({
    where: { isDeleted: false, ...(userId && { userId }) },
    orderBy: { name: "asc" },
  });
  return products.map(toView);
}

/** List products with current stock + low-stock flag.
 *  CACHED: 10-second server-side cache. */
export async function listProductsWithStock(userId?: string | null): Promise<ProductWithStock[]> {
  return cached(`products:list-with-stock:${userId ?? "all"}`, async () => {
    const products = await prisma.product.findMany({
      where: { isDeleted: false, ...(userId && { userId }) },
      orderBy: { name: "asc" },
    });

    // Batch compute stock for all products at once to avoid N+1.
    const stockByProduct = await computeStockForAllProducts();

    return products.map((p) => {
      const stock = stockByProduct.get(p.id) ?? new Decimal(0);
      return {
        ...toView(p),
        currentStock: stock.toString(),
        isLowStock: stock.lte(p.lowStockThreshold),
      };
    });
  });
}

/** Fetch one product. */
export async function getProduct(id: string): Promise<ProductView> {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.isDeleted) {
    throw new NotFoundError("Product", id);
  }
  return toView(product);
}

/** Fetch one product with current stock. */
export async function getProductWithStock(id: string): Promise<ProductWithStock> {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.isDeleted) {
    throw new NotFoundError("Product", id);
  }
  const stock = await getProductStock(id);
  return {
    ...toView(product),
    currentStock: stock.toString(),
    isLowStock: stock.lte(product.lowStockThreshold),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Search — used by the New Sale product picker.
// ────────────────────────────────────────────────────────────────────────────

export type ProductSearchResult = ProductView & {
  currentStock: string;
  isLowStock: boolean;
};

/**
 * Search products by name OR SKU (case-insensitive contains).
 * Returns products with their current stock so the UI can warn if
 * the owner tries to sell more than available.
 *
 * - Empty/null/whitespace query → returns all products (sorted by name)
 * - Short query (< 2 chars) → returns [] (avoids expensive LIKE scans)
 */
export async function searchProducts(
  query: string | null | undefined,
  userId?: string | null,
): Promise<ProductSearchResult[]> {
  const q = (query ?? "").trim();

  if (q.length > 0 && q.length < 2) {
    return [];
  }

  const products = await prisma.product.findMany({
    where: {
      isDeleted: false,
      ...(userId && { userId }),
      ...(q.length > 0 && {
        OR: [
          { name: { contains: q } },
          { sku: { contains: q } },
        ],
      }),
    },
    orderBy: { name: "asc" },
    take: 50,
  });

  // Batch-compute stock for all matching products (avoids N+1).
  const stockByProduct = await computeStockForAllProducts();

  return products.map((p) => {
    const stock = stockByProduct.get(p.id) ?? new Decimal(0);
    return {
      ...toView(p),
      currentStock: stock.toString(),
      isLowStock: stock.lte(p.lowStockThreshold),
    };
  });
}

/** Compute current stock for a single product. */
export async function getProductStock(productId: string): Promise<Decimal> {
  const [product, movesAgg, soldAgg] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: productId } }),
    prisma.stockMove.aggregate({
      _sum: { quantity: true },
      where: { productId, voidedAt: null },
    }),
    prisma.saleItem.aggregate({
      _sum: { quantity: true },
      where: {
        productId,
        sale: { voidedAt: null },
      },
    }),
  ]);

  const opening = toDecimalOrZero(product.openingStock);
  const moves = toDecimalOrZero(movesAgg._sum.quantity);
  const sold = toDecimalOrZero(soldAgg._sum.quantity);

  return opening.plus(moves).minus(sold);
}

/**
 * Batch compute stock for ALL products in one query (avoids N+1).
 * Returns a Map<productId, Decimal>.
 *
 * Implementation note: SQLite doesn't support GROUP BY joins well in Prisma.
 * We do two groupBys (one for stock moves, one for sale items) and merge them
 * in JS. Still O(products) queries — but 2 queries total instead of 2*N.
 */
export async function computeStockForAllProducts(): Promise<Map<string, Decimal>> {
  const [products, movesGrouped, soldGrouped] = await Promise.all([
    prisma.product.findMany({ where: { isDeleted: false }, select: { id: true, openingStock: true } }),
    prisma.stockMove.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      where: { voidedAt: null },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      where: { sale: { voidedAt: null } },
    }),
  ]);

  const movesByProduct = new Map(
    movesGrouped.map((m) => [m.productId, toDecimalOrZero(m._sum.quantity)]),
  );
  const soldByProduct = new Map(
    soldGrouped.map((s) => [s.productId, toDecimalOrZero(s._sum.quantity)]),
  );

  const result = new Map<string, Decimal>();
  for (const p of products) {
    const opening = toDecimalOrZero(p.openingStock);
    const moves = movesByProduct.get(p.id) ?? new Decimal(0);
    const sold = soldByProduct.get(p.id) ?? new Decimal(0);
    result.set(p.id, opening.plus(moves).minus(sold));
  }
  return result;
}

/** Create a new product. Throws on duplicate SKU (Prisma P2002 → fail()). */
export async function createProduct(input: unknown, userId?: string | null): Promise<ProductView> {
  const data = createProductSchema.parse(input);
  const product = await prisma.product.create({
    data: {
      name: data.name,
      category: data.category ?? null,
      purchasePrice: data.purchasePrice,
      sellingPrice: data.sellingPrice,
      unit: data.unit,
      sku: data.sku ?? null,
      openingStock: data.openingStock,
      lowStockThreshold: data.lowStockThreshold,
      ...(userId && { userId }),
    },
  });
  invalidateCache("products");
  invalidateCache("dashboard");
  return toView(product);
}

/** Update a product. */
export async function updateProduct(id: string, input: unknown): Promise<ProductView> {
  await getProduct(id); // throws if not found
  const data = updateProductSchema.parse(input);

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.purchasePrice !== undefined && { purchasePrice: data.purchasePrice }),
      ...(data.sellingPrice !== undefined && { sellingPrice: data.sellingPrice }),
      ...(data.unit !== undefined && { unit: data.unit }),
      ...(data.sku !== undefined && { sku: data.sku }),
      ...(data.lowStockThreshold !== undefined && { lowStockThreshold: data.lowStockThreshold }),
      // openingStock is intentionally NOT updatable.
    },
  });

  invalidateCache("products");
  invalidateCache("dashboard");

  return toView(updated);
}
