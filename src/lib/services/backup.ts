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
import { recordAudit } from "@/lib/services/audit";

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
    suppliers: number;
    purchases: number;
    purchaseItems: number;
    supplierPayments: number;
    reminders: number;
    followUps: number;
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
    suppliers: Array<Record<string, unknown>>;
    purchases: Array<Record<string, unknown>>;
    purchaseItems: Array<Record<string, unknown>>;
    supplierPayments: Array<Record<string, unknown>>;
    reminders: Array<Record<string, unknown>>;
    followUps: Array<Record<string, unknown>>;
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
    suppliers,
    purchases,
    purchaseItems,
    supplierPayments,
    reminders,
    followUps,
  ] = await Promise.all([
    prisma.setting.findMany({ where: userWhere }),
    prisma.customer.findMany({ where: userWhere }),
    prisma.product.findMany({ where: userWhere }),
    prisma.sale.findMany({ where: userWhere }),
    prisma.saleItem.findMany({ where: saleItemWhere }),
    prisma.payment.findMany({ where: userWhere }),
    prisma.customerAdjustment.findMany({ where: userWhere }),
    prisma.stockMove.findMany({ where: userWhere }),
    prisma.expense.findMany({ where: userWhere }),
    prisma.transaction.findMany({ where: userWhere }),
    prisma.supplier.findMany({ where: userWhere }),
    prisma.purchase.findMany({ where: userWhere }),
    prisma.purchaseItem.findMany({
      where: userId ? { purchase: { userId } } : undefined,
    }),
    prisma.supplierPayment.findMany({ where: userWhere }),
    prisma.reminder.findMany({ where: userWhere }),
    prisma.followUp.findMany({ where: userWhere }),
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
      suppliers: suppliers.length,
      purchases: purchases.length,
      purchaseItems: purchaseItems.length,
      supplierPayments: supplierPayments.length,
      reminders: reminders.length,
      followUps: followUps.length,
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
      suppliers: suppliers.map((s) => serialize(s)),
      purchases: purchases.map((s) => serialize(s)),
      purchaseItems: purchaseItems.map((s) => serialize(s)),
      supplierPayments: supplierPayments.map((s) => serialize(s)),
      reminders: reminders.map((s) => serialize(s)),
      followUps: followUps.map((s) => serialize(s)),
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
  | "transactions"
  | "suppliers"
  | "purchases"
  | "purchaseItems"
  | "supplierPayments"
  | "reminders"
  | "followUps";

export const EXPORTABLE_TABLES: Array<{ value: ExportableTable; label: string; description: string }> = [
  { value: "customers", label: "Customers", description: "All customers with balances" },
  { value: "products", label: "Products", description: "Products with prices + stock" },
  { value: "sales", label: "Sales", description: "All sale invoices" },
  { value: "saleItems", label: "Sale Items", description: "Line items per sale" },
  { value: "payments", label: "Payments", description: "All payments received" },
  { value: "stockMoves", label: "Stock Movements", description: "Purchases + adjustments" },
  { value: "expenses", label: "Expenses", description: "All business expenses" },
  { value: "transactions", label: "Transactions", description: "Unified ledger" },
  { value: "suppliers", label: "Suppliers", description: "Suppliers with payables" },
  { value: "purchases", label: "Purchases", description: "All purchase invoices" },
  { value: "purchaseItems", label: "Purchase Items", description: "Line items per purchase" },
  { value: "supplierPayments", label: "Supplier Payments", description: "Payments made to suppliers" },
  { value: "reminders", label: "Reminders", description: "Follow-up reminders" },
  { value: "followUps", label: "Follow-ups", description: "Sales opportunities and outcomes" },
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
  const purchaseItemWhere = userId ? { purchase: { userId } } : undefined;

  switch (table) {
    case "customers":         return (await prisma.customer.findMany({ where: userWhere, orderBy: { name: "asc" } })).map(serialize);
    case "products":          return (await prisma.product.findMany({ where: userWhere, orderBy: { name: "asc" } })).map(serialize);
    case "sales":             return (await prisma.sale.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "saleItems":         return (await prisma.saleItem.findMany({ where: saleItemWhere, orderBy: { saleId: "asc" } })).map(serialize);
    case "payments":          return (await prisma.payment.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "stockMoves":        return (await prisma.stockMove.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "expenses":          return (await prisma.expense.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "transactions":      return (await prisma.transaction.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "suppliers":         return (await prisma.supplier.findMany({ where: userWhere, orderBy: { name: "asc" } })).map(serialize);
    case "purchases":         return (await prisma.purchase.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "purchaseItems":     return (await prisma.purchaseItem.findMany({ where: purchaseItemWhere, orderBy: { purchaseId: "asc" } })).map(serialize);
    case "supplierPayments":  return (await prisma.supplierPayment.findMany({ where: userWhere, orderBy: { date: "desc" } })).map(serialize);
    case "reminders":         return (await prisma.reminder.findMany({ where: userWhere, orderBy: { dueAt: "asc" } })).map(serialize);
    case "followUps":         return (await prisma.followUp.findMany({ where: userWhere, orderBy: { createdAt: "desc" } })).map(serialize);
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
    throw new BadRequestError("api.backup.invalidJson");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new BadRequestError("api.backup.notObject");
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.version !== "number") {
    throw new BadRequestError("api.backup.missingVersion");
  }

  if (obj.version !== BACKUP_VERSION) {
    throw new BadRequestError(
      "api.backup.unsupportedVersion",
      undefined,
      { version: String(obj.version), expected: String(BACKUP_VERSION) },
    );
  }

  if (!obj.data || typeof obj.data !== "object") {
    throw new BadRequestError("api.backup.missingData");
  }

  const data = obj.data as Record<string, unknown>;

  // Check all required tables are present
  for (const table of REQUIRED_TABLES) {
    if (!Array.isArray(data[table])) {
      throw new BadRequestError(
        "api.backup.missingTable",
        undefined,
        { table },
      );
    }
  }

  // Backups made before suppliers/purchases/reminders existed are still valid.
  // Fill the newer tables so the rest of the code can read them safely.
  const backup = parsed as BackupFile;
  const hadSuppliers = Array.isArray(backup.data.suppliers);
  backup.data.suppliers ??= [];
  backup.data.purchases ??= [];
  backup.data.purchaseItems ??= [];
  backup.data.supplierPayments ??= [];
  backup.data.reminders ??= [];
  backup.data.followUps ??= [];

  // An older backup has no supplier table, so any supplier link on a ledger
  // row cannot be restored. Drop the link instead of failing the whole import.
  if (!hadSuppliers) {
    backup.data.transactions = backup.data.transactions.map((t) => ({
      ...t,
      supplierId: null,
    }));
  }

  return backup;
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
    throw new BadRequestError("api.backup.confirmRequired");
  }

  const backup = parseBackupFile(content);

  // Reminders and follow-ups belong to a person, not just a business. A
  // legacy backup containing them cannot be restored without an owner.
  if (!userId && (backup.data.reminders.length > 0 || backup.data.followUps.length > 0)) {
    throw new BadRequestError("api.backup.import.userRequired");
  }

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
    const purchaseItemWhere = userId ? { purchase: { userId } } : undefined;

    await tx.transaction.deleteMany({ where: userWhere });
    await tx.followUp.deleteMany({ where: userWhere });
    await tx.reminder.deleteMany({ where: userWhere });
    await tx.supplierPayment.deleteMany({ where: userWhere });
    await tx.purchaseItem.deleteMany({ where: purchaseItemWhere });
    await tx.purchase.deleteMany({ where: userWhere });
    await tx.supplier.deleteMany({ where: userWhere });
    await tx.saleItem.deleteMany({ where: saleItemWhere });
    await tx.payment.deleteMany({ where: userWhere });
    await tx.sale.deleteMany({ where: userWhere });
    await tx.stockMove.deleteMany({ where: userWhere });
    await tx.expense.deleteMany({ where: userWhere });
    await tx.customerAdjustment.deleteMany({ where: userWhere });
    await tx.customer.deleteMany({ where: userWhere });
    await tx.product.deleteMany({ where: userWhere });
    // Setting is per-user — only delete and import for this user.
    if (userId) {
      await tx.setting.deleteMany({ where: { userId } });
    }

    // Insert in dependency order (parents first, children last).
    // Every create stamps the row with `userId` so the imported data belongs
    // to the authenticated user. NEVER trust userId from the backup file body —
    // always overwrite with the server-provided id.
    // 1. Settings (per-user) — upsert to be safe
    if (backup.data.settings.length > 0 && userId) {
      const firstSetting = backup.data.settings[0];
      if (firstSetting) {
        const deserialized = deserializeSetting(firstSetting);
        await tx.setting.upsert({
          where: { userId },
          create: { ...deserialized, userId },
          update: { ...deserialized, userId },
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

    // 4. Suppliers (no FK dependencies except the user)
    if (backup.data.suppliers.length > 0) {
      await tx.supplier.createMany({
        data: backup.data.suppliers.map((r) => ({
          ...deserializeSupplier(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 5. Stock Moves (FK: product). Inserted before sale items and purchase
    //    items because both can point at a batch.
    if (backup.data.stockMoves.length > 0) {
      await tx.stockMove.createMany({
        data: backup.data.stockMoves.map((r) => ({
          ...deserializeStockMove(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 6. Sales (FK: customer)
    if (backup.data.sales.length > 0) {
      await tx.sale.createMany({
        data: backup.data.sales.map((r) => ({
          ...deserializeSale(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 7. Sale Items (FK: sale + product + optional stock move). SaleItem has
    //    no userId column — its ownership is inherited from its parent Sale.
    if (backup.data.saleItems.length > 0) {
      await tx.saleItem.createMany({
        data: backup.data.saleItems.map(deserializeSaleItem),
      });
    }

    // 8. Purchases (FK: supplier)
    if (backup.data.purchases.length > 0) {
      await tx.purchase.createMany({
        data: backup.data.purchases.map((r) => ({
          ...deserializePurchase(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 9. Purchase Items (FK: purchase + product + optional stock move).
    //    PurchaseItem has no userId column — ownership comes from its purchase.
    if (backup.data.purchaseItems.length > 0) {
      await tx.purchaseItem.createMany({
        data: backup.data.purchaseItems.map(deserializePurchaseItem),
      });
    }

    // 10. Supplier Payments (FK: supplier + optional purchase)
    if (backup.data.supplierPayments.length > 0) {
      await tx.supplierPayment.createMany({
        data: backup.data.supplierPayments.map((r) => ({
          ...deserializeSupplierPayment(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 11. Reminders (FK: optional customer / supplier / product)
    if (backup.data.reminders.length > 0) {
      await tx.reminder.createMany({
        data: backup.data.reminders.map((r) => ({
          ...deserializeReminder(r),
          userId: userId as string,
        })),
      });
    }

    // 12. Follow-ups (FK: customer + optional product)
    if (backup.data.followUps.length > 0) {
      await tx.followUp.createMany({
        data: backup.data.followUps.map((r) => ({
          ...deserializeFollowUp(r),
          userId: userId as string,
        })),
      });
    }

    // 13. Payments (FK: customer + optional sale)
    if (backup.data.payments.length > 0) {
      await tx.payment.createMany({
        data: backup.data.payments.map((r) => ({
          ...deserializePayment(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 14. Expenses (no FK)
    if (backup.data.expenses.length > 0) {
      await tx.expense.createMany({
        data: backup.data.expenses.map((r) => ({
          ...deserializeExpense(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 15. Customer Adjustments (FK: customer)
    if (backup.data.customerAdjustments.length > 0) {
      await tx.customerAdjustment.createMany({
        data: backup.data.customerAdjustments.map((r) => ({
          ...deserializeCustomerAdjustment(r),
          ...(userId && { userId }),
        })),
      });
    }

    // 16. Transactions (FK: optional customer + product + supplier)
    if (backup.data.transactions.length > 0) {
      await tx.transaction.createMany({
        data: backup.data.transactions.map((r) => ({
          ...deserializeTransaction(r),
          ...(userId && { userId }),
        })),
      });
    }
  });

  // Count what was actually restored rather than trusting the file's summary.
  const imported: BackupFile["counts"] = {
    settings: backup.data.settings.length,
    customers: backup.data.customers.length,
    products: backup.data.products.length,
    sales: backup.data.sales.length,
    saleItems: backup.data.saleItems.length,
    payments: backup.data.payments.length,
    customerAdjustments: backup.data.customerAdjustments.length,
    stockMoves: backup.data.stockMoves.length,
    expenses: backup.data.expenses.length,
    transactions: backup.data.transactions.length,
    suppliers: backup.data.suppliers.length,
    purchases: backup.data.purchases.length,
    purchaseItems: backup.data.purchaseItems.length,
    supplierPayments: backup.data.supplierPayments.length,
    reminders: backup.data.reminders.length,
    followUps: backup.data.followUps.length,
  };

  if (userId) {
    await recordAudit(userId, {
      action: "backup.import",
      entityType: "Business",
      summary: "Restored a backup",
      metadata: imported,
    });
  }

  return { success: true, imported };
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
  const supplierIds = new Set(backup.data.suppliers.map((s) => s.id as string));
  const purchaseIds = new Set(backup.data.purchases.map((p) => p.id as string));
  const stockMoveIds = new Set(backup.data.stockMoves.map((m) => m.id as string));

  // Sale.customerId must exist
  for (const s of backup.data.sales) {
    if (!customerIds.has(s.customerId as string)) {
      throw new BadRequestError(
        "api.backup.fkSaleCustomer",
        undefined,
        { saleId: String(s.id), customerId: String(s.customerId) },
      );
    }
  }

  // SaleItem.saleId + productId must exist
  for (const si of backup.data.saleItems) {
    if (!saleIds.has(si.saleId as string)) {
      throw new BadRequestError(
        "api.backup.fkSaleItemSale",
        undefined,
        { id: String(si.id), saleId: String(si.saleId) },
      );
    }
    if (!productIds.has(si.productId as string)) {
      throw new BadRequestError(
        "api.backup.fkSaleItemProduct",
        undefined,
        { id: String(si.id), productId: String(si.productId) },
      );
    }
  }

  // Payment.customerId must exist
  for (const p of backup.data.payments) {
    if (!customerIds.has(p.customerId as string)) {
      throw new BadRequestError(
        "api.backup.fkPaymentCustomer",
        undefined,
        { id: String(p.id), customerId: String(p.customerId) },
      );
    }
    // Payment.saleId is optional — only check if present
    if (p.saleId && !saleIds.has(p.saleId as string)) {
      throw new BadRequestError(
        "api.backup.fkPaymentSale",
        undefined,
        { id: String(p.id), saleId: String(p.saleId) },
      );
    }
  }

  // CustomerAdjustment.customerId must exist
  for (const a of backup.data.customerAdjustments) {
    if (!customerIds.has(a.customerId as string)) {
      throw new BadRequestError(
        "api.backup.fkAdjustmentCustomer",
        undefined,
        { id: String(a.id), customerId: String(a.customerId) },
      );
    }
  }

  // StockMove.productId must exist
  for (const m of backup.data.stockMoves) {
    if (!productIds.has(m.productId as string)) {
      throw new BadRequestError(
        "api.backup.fkStockMoveProduct",
        undefined,
        { id: String(m.id), productId: String(m.productId) },
      );
    }
  }

  // SaleItem.stockMoveId is optional — only check if present
  for (const si of backup.data.saleItems) {
    if (si.stockMoveId && !stockMoveIds.has(si.stockMoveId as string)) {
      throw new BadRequestError(
        "api.backup.fkSaleItemStockMove",
        undefined,
        { id: String(si.id), stockMoveId: String(si.stockMoveId) },
      );
    }
  }

  // Purchase.supplierId must exist
  for (const p of backup.data.purchases) {
    if (!supplierIds.has(p.supplierId as string)) {
      throw new BadRequestError(
        "api.backup.fkPurchaseSupplier",
        undefined,
        { id: String(p.id), supplierId: String(p.supplierId) },
      );
    }
  }

  // PurchaseItem.purchaseId + productId must exist; stockMoveId is optional
  for (const pi of backup.data.purchaseItems) {
    if (!purchaseIds.has(pi.purchaseId as string)) {
      throw new BadRequestError(
        "api.backup.fkPurchaseItemPurchase",
        undefined,
        { id: String(pi.id), purchaseId: String(pi.purchaseId) },
      );
    }
    if (!productIds.has(pi.productId as string)) {
      throw new BadRequestError(
        "api.backup.fkPurchaseItemProduct",
        undefined,
        { id: String(pi.id), productId: String(pi.productId) },
      );
    }
    if (pi.stockMoveId && !stockMoveIds.has(pi.stockMoveId as string)) {
      throw new BadRequestError(
        "api.backup.fkPurchaseItemStockMove",
        undefined,
        { id: String(pi.id), stockMoveId: String(pi.stockMoveId) },
      );
    }
  }

  // SupplierPayment.supplierId must exist; purchaseId is optional
  for (const sp of backup.data.supplierPayments) {
    if (!supplierIds.has(sp.supplierId as string)) {
      throw new BadRequestError(
        "api.backup.fkSupplierPaymentSupplier",
        undefined,
        { id: String(sp.id), supplierId: String(sp.supplierId) },
      );
    }
    if (sp.purchaseId && !purchaseIds.has(sp.purchaseId as string)) {
      throw new BadRequestError(
        "api.backup.fkSupplierPaymentPurchase",
        undefined,
        { id: String(sp.id), purchaseId: String(sp.purchaseId) },
      );
    }
  }

  // Reminder links are all optional
  for (const r of backup.data.reminders) {
    if (r.customerId && !customerIds.has(r.customerId as string)) {
      throw new BadRequestError(
        "api.backup.fkReminderCustomer",
        undefined,
        { id: String(r.id), customerId: String(r.customerId) },
      );
    }
    if (r.supplierId && !supplierIds.has(r.supplierId as string)) {
      throw new BadRequestError(
        "api.backup.fkReminderSupplier",
        undefined,
        { id: String(r.id), supplierId: String(r.supplierId) },
      );
    }
    if (r.productId && !productIds.has(r.productId as string)) {
      throw new BadRequestError(
        "api.backup.fkReminderProduct",
        undefined,
        { id: String(r.id), productId: String(r.productId) },
      );
    }
  }

  // FollowUp.customerId must exist; productId is optional
  for (const f of backup.data.followUps) {
    if (!customerIds.has(f.customerId as string)) {
      throw new BadRequestError(
        "api.backup.fkFollowUpCustomer",
        undefined,
        { id: String(f.id), customerId: String(f.customerId) },
      );
    }
    if (f.productId && !productIds.has(f.productId as string)) {
      throw new BadRequestError(
        "api.backup.fkFollowUpProduct",
        undefined,
        { id: String(f.id), productId: String(f.productId) },
      );
    }
  }

  // Transaction.customerId + productId + supplierId (all optional)
  for (const t of backup.data.transactions) {
    if (t.customerId && !customerIds.has(t.customerId as string)) {
      throw new BadRequestError(
        "api.backup.fkTransactionCustomer",
        undefined,
        { id: String(t.id), customerId: String(t.customerId) },
      );
    }
    if (t.productId && !productIds.has(t.productId as string)) {
      throw new BadRequestError(
        "api.backup.fkTransactionProduct",
        undefined,
        { id: String(t.id), productId: String(t.productId) },
      );
    }
    if (t.supplierId && !supplierIds.has(t.supplierId as string)) {
      throw new BadRequestError(
        "api.backup.fkTransactionSupplier",
        undefined,
        { id: String(t.id), supplierId: String(t.supplierId) },
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
    businessName: row.businessName as string | null,
    currency: row.currency as string,
    currencySymbol: row.currencySymbol as string,
    ownerPinHash: (row.ownerPinHash as string | null) ?? null,
    timezone: row.timezone as string,
    customUnits: (row.customUnits as string[]) ?? [],
    theme: (row.theme as string) ?? "monochrome",
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeCustomer(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    companyName: (row.companyName as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    openingBalance: new Decimal(row.openingBalance as string | number),
    nextFollowUpAt: row.nextFollowUpAt ? deserializeDate(row.nextFollowUpAt) : null,
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

function deserializeSupplier(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    openingBalance: new Decimal((row.openingBalance as string | number | undefined) ?? 0),
    nextFollowUpAt: row.nextFollowUpAt ? deserializeDate(row.nextFollowUpAt) : null,
    isDeleted: (row.isDeleted as boolean) ?? false,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializePurchase(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    supplierId: row.supplierId as string,
    totalAmount: new Decimal(row.totalAmount as string | number),
    paidAmount: new Decimal((row.paidAmount as string | number | undefined) ?? 0),
    outstanding: new Decimal(row.outstanding as string | number),
    notes: (row.notes as string | null) ?? null,
    date: deserializeDate(row.date),
    voidedAt: row.voidedAt ? deserializeDate(row.voidedAt) : null,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializePurchaseItem(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    purchaseId: row.purchaseId as string,
    productId: row.productId as string,
    quantity: new Decimal(row.quantity as string | number),
    unitCost: new Decimal(row.unitCost as string | number),
    total: new Decimal(row.total as string | number),
    stockMoveId: (row.stockMoveId as string | null) ?? null,
  };
}

function deserializeSupplierPayment(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    supplierId: row.supplierId as string,
    purchaseId: (row.purchaseId as string | null) ?? null,
    amount: new Decimal(row.amount as string | number),
    method: (row.method as string) ?? "cash",
    notes: (row.notes as string | null) ?? null,
    date: deserializeDate(row.date),
    voidedAt: row.voidedAt ? deserializeDate(row.voidedAt) : null,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeReminder(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    title: row.title as string,
    notes: (row.notes as string | null) ?? null,
    type: (row.type as string) ?? "custom",
    dueAt: deserializeDate(row.dueAt),
    completedAt: row.completedAt ? deserializeDate(row.completedAt) : null,
    priority: (row.priority as string) ?? "normal",
    customerId: (row.customerId as string | null) ?? null,
    supplierId: (row.supplierId as string | null) ?? null,
    productId: (row.productId as string | null) ?? null,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeFollowUp(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    customerId: row.customerId as string,
    productId: (row.productId as string | null) ?? null,
    kind: (row.kind as string) ?? "reorder",
    reason: row.reason as string,
    message: row.message as string,
    outcome: (row.outcome as string) ?? "pending",
    outcomeNote: (row.outcomeNote as string | null) ?? null,
    contactedAt: row.contactedAt ? deserializeDate(row.contactedAt) : null,
    resolvedAt: row.resolvedAt ? deserializeDate(row.resolvedAt) : null,
    createdAt: deserializeDate(row.createdAt),
    updatedAt: deserializeDate(row.updatedAt),
  };
}

function deserializeSale(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    customerId: row.customerId as string,
    totalAmount: new Decimal(row.totalAmount as string | number),
    discountAmount: new Decimal((row.discountAmount as string | number | undefined) ?? 0),
    paidAmount: new Decimal(row.paidAmount as string | number),
    outstanding: new Decimal(row.outstanding as string | number),
    notes: (row.notes as string | null) ?? null,
    date: deserializeDate(row.date),
    dueDate: row.dueDate ? deserializeDate(row.dueDate) : null,
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
    batchName: (row.batchName as string | null) ?? null,
    remainingQuantity: new Decimal(
      (row.remainingQuantity as string | number | undefined) ?? 0,
    ),
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
    supplierId: (row.supplierId as string | null) ?? null,
    amount: new Decimal(row.amount as string | number),
    direction: row.direction as string,
    date: deserializeDate(row.date),
    notes: (row.notes as string | null) ?? null,
    createdAt: deserializeDate(row.createdAt),
  };
}
