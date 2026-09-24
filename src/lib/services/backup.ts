/**
 * Backup service layer.
 *
 * Two export formats:
 *   1. JSON (full backup) — preserves ALL relationships, used for restore.
 *      Returns the entire database as a single nested object.
 *   2. CSV (per-table) — for opening in Excel/spreadsheets. One file per table.
 *
 * Import:
 *   JSON only (CSV would lose relationships). Validates structure + integrity
 *   before applying. Replaces all existing data (with explicit user confirmation
 *   in the UI — the API requires a `confirmReplace: true` flag).
 *
 * Safety principles:
 *   - Never silently discard records — if a row fails validation, abort the
 *     entire import and return the error.
 *   - Detect malformed files (invalid JSON, missing required fields, wrong
 *     versions) and return clear error messages.
 *   - Preserve relationships by re-mapping IDs (or keeping original IDs if
 *     they don't collide).
 *   - Use prisma.$transaction for the entire import — all-or-nothing.
 */

import { prisma } from "@/lib/db/prisma";
import { BadRequestError } from "@/lib/errors";
import { Decimal } from "@/lib/utils/decimal";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export const BACKUP_VERSION = 1;

export type BackupFile = {
  version: number;
  exportedAt: string; // ISO datetime
  businessName: string | null;
  currency: string;
  currencySymbol: string;
  counts: {
    customers: number;
    products: number;
    sales: number;
    saleItems: number;
    payments: number;
    customerAdjustments: number;
    stockMoves: number;
    expenses: number;
    transactions: number;
    settings: number;
  };
  data: {
    settings: Array<Record<string, unknown>>;
    customers: Array<Record<string, unknown>>;
    products: Array<Record<string, unknown>>;
    sales: Array<Record<string, unknown>>;
    saleItems: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    customerAdjustments: Array<Record<string, unknown>>;
    stockMoves: Array<Record<string, unknown>>;
    expenses: Array<Record<string, unknown>>;
    transactions: Array<Record<string, unknown>>;
  };
};

export type ImportError = {
  message: string;
  details?: unknown;
};

export type ImportResult = {
  success: true;
  imported: BackupFile["counts"];
};

// ────────────────────────────────────────────────────────────────────────────
// Export (JSON — full backup)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Export the entire database as a JSON-serializable object.
 * Preserves all relationships (foreign keys are kept as-is).
 *
 * When `userId` is provided, only records belonging to that user are exported
 * (multi-tenant isolation). SaleItem (which has no userId column) is filtered
 * via its parent Sale. The Setting singleton is always included (it's global).
 * When userId is null, all data is exported (backward compat for pre-auth data).
 */
export async function exportBackup(userId?: string | null): Promise<BackupFile> {
  const userWhere = userId ? { userId } : undefined;
  const saleItemWhere = userId ? { sale: { userId } } : undefined;

  const [
    settings,
    customers,
    products,
    sales,
    saleItems,
    payments,
    customerAdjustments,
    stockMoves,
    expenses,
    transactions,
  ] = await Promise.all([
    prisma.setting.findMany(),
    prisma.customer.findMany({ where: userWhere }),
    prisma.product.findMany({ where: userWhere }),
    prisma.sale.findMany({ where: userWhere }),
    prisma.saleItem.findMany({ where: saleItemWhere }),
    prisma.payment.findMany({ where: userWhere }),
    prisma.customerAdjustment.findMany({ where: userWhere }),
    prisma.stockMove.findMany({ where: userWhere }),
    prisma.expense.findMany({ where: userWhere }),
    prisma.transaction.findMany({ where: userWhere }),
  ]);

  const setting = settings[0];

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    businessName: setting?.businessName ?? null,
    currency: setting?.currency ?? "PKR",
    currencySymbol: setting?.currencySymbol ?? "Rs.",
    counts: {
      customers: customers.length,
      products: products.length,
      sales: sales.length,
      saleItems: saleItems.length,
      payments: payments.length,
      customerAdjustments: customerAdjustments.length,
      stockMoves: stockMoves.length,
      expenses: expenses.length,
      transactions: transactions.length,
      settings: settings.length,
    },
    data: {
      settings: settings.map((s) => serialize(s)),
      customers: customers.map((s) => serialize(s)),
      products: products.map((s) => serialize(s)),
      sales: sales.map((s) => serialize(s)),
      saleItems: saleItems.map((s) => serialize(s)),
      payments: payments.map((s) => serialize(s)),
      customerAdjustments: customerAdjustments.map((s) => serialize(s)),
      stockMoves: stockMoves.map((s) => serialize(s)),
      expenses: expenses.map((s) => serialize(s)),
      transactions: transactions.map((s) => serialize(s)),
    },
  };
}

/** Convert a Prisma row (with Decimal + Date fields) into a JSON-safe object. */
function serialize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Decimal) {
      out[key] = value.toString();
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Export (CSV — per-table)
// ────────────────────────────────────────────────────────────────────────────

export type ExportableTable =
  | "customers"
  | "products"
  | "sales"
  | "saleItems"
  | "payments"
  | "stockMoves"
  | "expenses"
  | "transactions";

export const EXPORTABLE_TABLES: Array<{ value: ExportableTable; label: string; description: string }> = [
  { value: "customers", label: "Customers", description: "All customers with balances" },
  { value: "products", label: "Products", description: "Products with prices + stock" },
  { value: "sales", label: "Sales", description: "All sale invoices" },
  { value: "saleItems", label: "Sale Items", description: "Line items per sale" },
  { value: "payments", label: "Payments", description: "All payments received" },
  { value: "stockMoves", label: "Stock Movements", description: "Purchases + adjustments" },
  { value: "expenses", label: "Expenses", description: "All business expenses" },
  { value: "transactions", label: "Transactions", description: "Unified ledger" },
];

/**
 * Fetch one table's rows as an array of plain objects (Decimals → strings,
 * Dates → ISO strings). Used by the CSV exporter.
 *
 * When `userId` is provided, only rows belonging to that user are returned.
 * SaleItem (no userId column) is filtered via its parent Sale.
 */
export async function fetchTableRows(
  table: ExportableTable,
  userId?: string | null,
): Promise<Array<Record<string, unknown>>> {
  const userWhere = userId ? { userId } : undefined;
  const saleItemWhere = userId ? { sale: { userId } } : undefined;

  switch (table) {
    case "customers":         return (await prisma.customer.findMany({ where: userWhere, orderBy: { name: "asc" } })).map(serialize);
    case "products":          return (await prisma.product.findMany({ where: userWhere, orderBy: { name: "asc" } })).map(serialize);
    case "sales":             return (await prisma.sale.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "saleItems":         return (await prisma.saleItem.findMany({ where: saleItemWhere, orderBy: { saleId: "asc" } })).map(serialize);
    case "payments":          return (await prisma.payment.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "stockMoves":        return (await prisma.stockMove.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "expenses":          return (await prisma.expense.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "transactions":      return (await prisma.transaction.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
  }
}

/**
 * Convert an array of objects to a CSV string.
 * - First object's keys become the header row
 * - All values are stringified + escaped (quotes doubled)
 * - Handles null/undefined as empty string
 * - Handles Decimal-as-string, Date-as-ISO-string
 */
export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";

  // Collect all unique keys (in case some rows have different keys)
  const keys = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );

  const escapeCell = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = typeof value === "string" ? value : String(value);

    // CSV formula injection defense:
    // If a cell starts with =, +, -, @, tab, or carriage return, Excel/LibreOffice
    // will evaluate it as a formula. Prefix with a single quote to neutralize.
    // (The quote is invisible in Excel — it's treated as a text indicator.)
    let safe = str;
    if (safe.length > 0 && /^[=+\-@\t\r]/.test(safe)) {
      safe = `'${safe}`;
    }

    // Wrap in quotes if contains comma, quote, or newline; escape quotes by doubling
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n") || safe.includes("\r")) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };

  const header = keys.map(escapeCell).join(",");
  const body = rows
    .map((row) => keys.map((k) => escapeCell(row[k])).join(","))
    .join("\n");

  return `${header}\n${body}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Import (JSON — full restore)
// ────────────────────────────────────────────────────────────────────────────

const REQUIRED_TABLES = [
  "settings",
  "customers",
  "products",
  "sales",
  "saleItems",
  "payments",
  "customerAdjustments",
  "stockMoves",
  "expenses",
  "transactions",
] as const;

/**
 * Parse + validate a backup file string (from uploaded file).
 * Returns the parsed BackupFile or throws BadRequestError on malformed input.
 */
export function parseBackupFile(content: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new BadRequestError("File is not valid JSON. Cannot import.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new BadRequestError("Backup file is not a valid JSON object.");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.version !== "number") {
    throw new BadRequestError("Backup file is missing a 'version' field.");
  }

  if (obj.version !== BACKUP_VERSION) {
    throw new BadRequestError(
      `Backup file version (${obj.version}) is not supported. Expected version ${BACKUP_VERSION}.`,
    );
  }

  if (!obj.data || typeof obj.data !== "object") {
    throw new BadRequestError("Backup file is missing the 'data' object.");
  }

  const data = obj.data as Record<string, unknown>;

  // Check all required tables are present
  for (const table of REQUIRED_TABLES) {
    if (!Array.isArray(data[table])) {
      throw new BadRequestError(
        `Backup file is missing the '${table}' table (or it's not an array).`,
      );
    }
  }

  return parsed as BackupFile;
}

/**
 * Import (restore) a backup file.
 *
 * Strategy:
 *   1. Parse + validate the file structure (parseBackupFile)
 *   2. Verify all referenced foreign keys exist within the backup
 *   3. Wrap the entire import in prisma.$transaction
 *   4. Delete existing data in reverse-dependency order
 *      (when userId is provided, ONLY that user's data is deleted — other users untouched)
 *   5. Insert new data in dependency order, stamping every row with the given userId
 *      (NEVER trust userId from the backup file — always use the server-provided one)
 *   6. If any step fails, the transaction rolls back — original data is safe
 *
 * IMPORTANT: This REPLACES the user's existing data. The API requires
 * `confirmReplace: true` in the request body, and the UI shows a scary
 * confirmation dialog before calling this.
 */
export async function importBackup(
  content: string,
  options: { confirmReplace: boolean },
  userId?: string | null,
): Promise<ImportResult> {
  if (!options.confirmReplace) {
    throw new BadRequestError(
      "Import requires explicit confirmation. Set confirmReplace: true to proceed.",
    );
  }

  const backup = parseBackupFile(content);

  // Pre-flight integrity checks: verify all FK references exist within the backup.
  verifyIntegrity(backup);

  // Wrap everything in a single transaction — all or nothing.
  await prisma.$transaction(async (tx) => {
    // Delete in reverse dependency order (children first, parents last).
    // When userId is provided, only that user's rows are deleted — other users'
    // data is preserved (multi-tenant safety). SaleItem has no userId column,
    // so we scope it via its parent Sale.
    const userWhere = userId ? { userId } : undefined;
    const saleItemWhere = userId ? { sale: { userId } } : undefined;

    await tx.transaction.deleteMany({ where: userWhere });
    await tx.saleItem.deleteMany({ where: saleItemWhere });
    await tx.payment.deleteMany({ where: userWhere });
    await tx.sale.deleteMany({ where: userWhere });
    await tx.stockMove.deleteMany({ where: userWhere });
    await tx.expense.deleteMany({ where: userWhere });
    await tx.customerAdjustment.deleteMany({ where: userWhere });
    await tx.customer.deleteMany({ where: userWhere });
    await tx.product.deleteMany({ where: userWhere });
    // Setting is a global singleton — always wiped on import (single tenant per
    // business). We intentionally do NOT scope this by userId.
    await tx.setting.deleteMany({});

    // Insert in dependency order (parents first, children last).
    // Every create stamps the row with `userId` so the imported data belongs
    // to the authenticated user. NEVER trust userId from the backup file body —
    // always overwrite with the server-provided id.
    // 1. Settings (singleton)
    if (backup.data.settings.length > 0) {
      // Only insert the first setting (singleton pattern). We already
      // deleted all settings above, so no skipDuplicates needed.
      const firstSetting = backup.data.settings[0];
      if (firstSetting) {
        await tx.setting.create({
          data: deserializeSetting(firstSetting),
        });
      }
    }

    // 2. Customers (no FK dependencies except settings, which is singleton)
    if (backup.data.customers.length > 0) {
      await tx.customer.createMany({
        data: backup.data.customers.map((r) => ({
          ...deserializeCustomer(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 3. Products (no FK dependencies)
    if (backup.data.products.length > 0) {
      await tx.product.createMany({
        data: backup.data.products.map((r) => ({
          ...deserializeProduct(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 4. Customer Adjustments (FK: customer)
    if (backup.data.customerAdjustments.length > 0) {
      await tx.customerAdjustment.createMany({
        data: backup.data.customerAdjustments.map((r) => ({
          ...deserializeCustomerAdjustment(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 5. Sales (FK: customer)
    if (backup.data.sales.length > 0) {
      await tx.sale.createMany({
        data: backup.data.sales.map((r) => ({
          ...deserializeSale(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 6. Sale Items (FK: sale + product). SaleItem has no userId column —
    //    its ownership is inherited from its parent Sale.
    if (backup.data.saleItems.length > 0) {
      await tx.saleItem.createMany({
        data: backup.data.saleItems.map(deserializeSaleItem),
      });
    }

    // 7. Payments (FK: customer + optional sale)
    if (backup.data.payments.length > 0) {
      await tx.payment.createMany({
        data: backup.data.payments.map((r) => ({
          ...deserializePayment(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 8. Stock Moves (FK: product)
    if (backup.data.stockMoves.length > 0) {
      await tx.stockMove.createMany({
        data: backup.data.stockMoves.map((r) => ({
          ...deserializeStockMove(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 9. Expenses (no FK)
    if (backup.data.expenses.length > 0) {
      await tx.expense.createMany({
        data: backup.data.expenses.map((r) => ({
          ...deserializeExpense(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 10. Transactions (FK: optional customer + optional product)
    if (backup.data.transactions.length > 0) {
      await tx.transaction.createMany({
        data: backup.data.transactions.map((r) => ({
          ...deserializeTransaction(r),
          ...(userId && { userId }),
        })),
      });
    }
  });

  return {
    success: true,
    imported: backup.counts,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Integrity verification
// ────────────────────────────────────────────────────────────────────────────

/**
 * Verify that all foreign key references in the backup point to records that
 * also exist in the backup. This catches truncated/corrupted backups BEFORE
 * we start writing to the database.
 *
 * Throws BadRequestError with a specific message if any FK is dangling.
 */
function verifyIntegrity(backup: BackupFile): void {
  const customerIds = new Set(backup.data.customers.map((c) => c.id as string));
  const productIds = new Set(backup.data.products.map((p) => p.id as string));
  const saleIds = new Set(backup.data.sales.map((s) => s.id as string));

  // Sale.customerId must exist
  for (const s of backup.data.sales) {
    if (!customerIds.has(s.customerId as string)) {
      throw new BadRequestError(
        `Sale ${s.id} references customer ${s.customerId} which doesn't exist in the backup.`,
      );
    }
  }

  // SaleItem.saleId + productId must exist
  for (const si of backup.data.saleItems) {
    if (!saleIds.has(si.saleId as string)) {
      throw new BadRequestError(
        `SaleItem ${si.id} references sale ${si.saleId} which doesn't exist in the backup.`,
      );
    }
    if (!productIds.has(si.productId as string)) {
      throw new BadRequestError(
        `SaleItem ${si.id} references product ${si.productId} which doesn't exist in the backup.`,
      );
    }
  }

  // Payment.customerId must exist
  for (const p of backup.data.payments) {
    if (!customerIds.has(p.customerId as string)) {
      throw new BadRequestError(
        `Payment ${p.id} references customer ${p.customerId} which doesn't exist in the backup.`,
      );
    }
    // Payment.saleId is optional — only check if present
    if (p.saleId && !saleIds.has(p.saleId as string)) {
      throw new BadRequestError(
        `Payment ${p.id} references sale ${p.saleId} which doesn't exist in the backup.`,
      );
    }
  }

  // CustomerAdjustment.customerId must exist
  for (const a of backup.data.customerAdjustments) {
    if (!customerIds.has(a.customerId as string)) {
      throw new BadRequestError(
        `CustomerAdjustment ${a.id} references customer ${a.customerId} which doesn't exist in the backup.`,
      );
    }
  }

  // StockMove.productId must exist
  for (const m of backup.data.stockMoves) {
    if (!productIds.has(m.productId as string)) {
      throw new BadRequestError(
        `StockMove ${m.id} references product ${m.productId} which doesn't exist in the backup.`,
      );
    }
  }

  // Transaction.customerId + productId (both optional)
  for (const t of backup.data.transactions) {
    if (t.customerId && !customerIds.has(t.customerId as string)) {
      throw new BadRequestError(
        `Transaction ${t.id} references customer ${t.customerId} which doesn't exist in the backup.`,
      );
    }
    if (t.productId && !productIds.has(t.productId as string)) {
      throw new BadRequestError(
        `Transaction ${t.id} references product ${t.productId} which doesn't exist in the backup.`,
      );
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Deserializers (JSON row → Prisma create input)
// ────────────────────────────────────────────────────────────────────────────

function deserializeDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  return new Date();
}

function deserializeSetting(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    businessName: row.businessName as string | null,
    currency: row.currency as string,
    currencySymbol: row.currencySymbol as string,
    ownerPinHash: (row.ownerPinHash as string | null) ?? null,
    timezone: row.timezone as string,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeCustomer(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    openingBalance: new Decimal(row.openingBalance as string | number),
    isDeleted: (row.isDeleted as boolean) ?? false,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeProduct(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string | null) ?? null,
    purchasePrice: new Decimal(row.purchasePrice as string | number),
    sellingPrice: new Decimal(row.sellingPrice as string | number),
    unit: row.unit as string,
    sku: (row.sku as string | null) ?? null,
    openingStock: new Decimal(row.openingStock as string | number),
    lowStockThreshold: (row.lowStockThreshold as number) ?? 5,
    isDeleted: (row.isDeleted as boolean) ?? false,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeSale(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    customerId: row.customerId as string,
    totalAmount: new Decimal(row.totalAmount as string | number),
    paidAmount: new Decimal(row.paidAmount as string | number),
    outstanding: new Decimal(row.outstanding as string | number),
    notes: (row.notes as string | null) ?? null,
    date: deserializeDate(row.date),
    voidedAt: row.voidedAt ? deserializeDate(row.voidedAt) : null,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeSaleItem(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    saleId: row.saleId as string,
    productId: row.productId as string,
    quantity: new Decimal(row.quantity as string | number),
    unitPrice: new Decimal(row.unitPrice as string | number),
    total: new Decimal(row.total as string | number),
  };
}

function deserializePayment(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    customerId: row.customerId as string,
    saleId: (row.saleId as string | null) ?? null,
    amount: new Decimal(row.amount as string | number),
    method: row.method as string,
    notes: (row.notes as string | null) ?? null,
    date: deserializeDate(row.date),
    voidedAt: row.voidedAt ? deserializeDate(row.voidedAt) : null,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeCustomerAdjustment(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    customerId: row.customerId as string,
    amount: new Decimal(row.amount as string | number),
    reason: row.reason as string,
    notes: (row.notes as string | null) ?? null,
    date: deserializeDate(row.date),
    voidedAt: row.voidedAt ? deserializeDate(row.voidedAt) : null,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeStockMove(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    productId: row.productId as string,
    type: row.type as string,
    quantity: new Decimal(row.quantity as string | number),
    reason: (row.reason as string | null) ?? null,
    unitCost: row.unitCost ? new Decimal(row.unitCost as string | number) : null,
    date: deserializeDate(row.date),
    voidedAt: row.voidedAt ? deserializeDate(row.voidedAt) : null,
    createdAt: deserializeDate(row.createdAt),
  };
}

function deserializeExpense(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    amount: new Decimal(row.amount as string | number),
    category: row.category as string,
    notes: (row.notes as string | null) ?? null,
    date: deserializeDate(row.date),
    voidedAt: row.voidedAt ? deserializeDate(row.voidedAt) : null,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeTransaction(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    type: row.type as string,
    refType: row.refType as string,
    refId: row.refId as string,
    customerId: (row.customerId as string | null) ?? null,
    productId: (row.productId as string | null) ?? null,
    amount: new Decimal(row.amount as string | number),
    direction: row.direction as string,
    date: deserializeDate(row.date),
    notes: (row.notes as string | null) ?? null,
    createdAt: deserializeDate(row.createdAt),
  };
}
