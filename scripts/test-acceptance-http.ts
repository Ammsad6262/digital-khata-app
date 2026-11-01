/**
 * HTTP acceptance test — real workflows through the real API.
 *
 * Unlike scripts/test-foundation.ts (which calls the service layer directly),
 * this suite talks to a running Next.js server over HTTP with a real session
 * cookie, so it exercises routing, middleware, auth, validation, and the
 * database exactly as the browser does.
 *
 * Usage:
 *   npm run dev            # in another terminal
 *   npx tsx scripts/test-acceptance-http.ts
 *
 * Environment:
 *   TEST_BASE_URL   defaults to http://localhost:3000
 *   ADMIN_SECRET    read from .env when not already set
 *
 * The suite creates two throwaway users and deletes their rows at the end.
 */

import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

// ─── tiny .env loader (tsx does not load Next.js env files) ──────────────────
function loadEnvFile() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    const key = match?.[1];
    const value = match?.[2];
    if (key && process.env[key] === undefined) {
      process.env[key] = value ?? "";
    }
  }
}
loadEnvFile();

// ─── result tracking ────────────────────────────────────────────────────────
let passed = 0;
let skipped = 0;
const failures: Array<{ name: string; detail: string }> = [];

function skip(name: string, reason: string) {
  skipped++;
  console.log(`  \x1b[33m-\x1b[0m ${name} (skipped: ${reason})`);
}

function check(condition: unknown, name: string, detail = "") {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(actual: unknown, expected: unknown, name: string) {
  const a = String(actual);
  const e = String(expected);
  check(a === e, name, a === e ? "" : `expected ${e}, got ${a}`);
}

function section(title: string) {
  console.log(`\n\x1b[36m━━━ ${title} ━━━\x1b[0m`);
}

// ─── HTTP helper ────────────────────────────────────────────────────────────
type ApiResult = {
  status: number;
  json: any;
  text: string;
  cookie?: string;
};

async function api(
  method: string,
  route: string,
  options: {
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.cookie) headers["Cookie"] = options.cookie;

  const controller = new AbortController();
  const timer = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null;

  try {
    const res = await fetch(BASE + route, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      redirect: "manual",
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/dk_auth_token=([^;]+)/);
    return {
      status: res.status,
      json,
      text,
      cookie: match ? `dk_auth_token=${match[1]}` : undefined,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function data(result: ApiResult): any {
  return result.json?.data;
}

// ─── cleanup ────────────────────────────────────────────────────────────────
async function cleanupUser(userId: string) {
  const { rawPrisma } = await import("../src/lib/db/prisma");
  const statements: string[] = [
    `DELETE FROM "Transaction" WHERE "userId" = $1`,
    `DELETE FROM "SaleItem" WHERE "saleId" IN (SELECT id FROM "Sale" WHERE "userId" = $1)`,
    `DELETE FROM "PurchaseItem" WHERE "purchaseId" IN (SELECT id FROM "Purchase" WHERE "userId" = $1)`,
    `DELETE FROM "Payment" WHERE "userId" = $1`,
    `DELETE FROM "CustomerAdjustment" WHERE "userId" = $1`,
    `DELETE FROM "StockMove" WHERE "userId" = $1`,
    `DELETE FROM "SupplierPayment" WHERE "userId" = $1`,
    `DELETE FROM "Reminder" WHERE "userId" = $1`,
    `DELETE FROM "FollowUp" WHERE "userId" = $1`,
    `DELETE FROM "Expense" WHERE "userId" = $1`,
    `DELETE FROM "Sale" WHERE "userId" = $1`,
    `DELETE FROM "Purchase" WHERE "userId" = $1`,
    `DELETE FROM "Product" WHERE "userId" = $1`,
    `DELETE FROM "Supplier" WHERE "userId" = $1`,
    `DELETE FROM "Customer" WHERE "userId" = $1`,
    `DELETE FROM "Setting" WHERE "userId" = $1`,
    `DELETE FROM "AuditLog" WHERE "userId" = $1`,
    `DELETE FROM "PasswordResetCode" WHERE "userId" = $1`,
    `DELETE FROM "SmartEntrySession" WHERE "userId" = $1`,
    `DELETE FROM "RedeemCodeRedemption" WHERE "userId" = $1`,
    `DELETE FROM "UserSubscription" WHERE "userId" = $1`,
    `DELETE FROM "User" WHERE id = $1`,
  ];
  for (const sql of statements) {
    try {
      await rawPrisma.$executeRawUnsafe(sql, userId);
    } catch {
      // Table or column may not exist in an older local schema — ignore.
    }
  }
  await rawPrisma.$disconnect();
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\x1b[1mHTTP acceptance test\x1b[0m against ${BASE}`);

  // Wait for the server to be ready.
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) {
    console.log(`\x1b[31mServer not reachable at ${BASE}. Start it with npm run dev.\x1b[0m`);
    process.exit(2);
  }

  const runId = Date.now().toString().slice(-8);
  const emailA = `accept-a-${runId}@example.com`;
  const emailB = `accept-b-${runId}@example.com`;
  const password = "Acceptance!123";

  // ═══════════════════════════════════════════════════════════════════════
  section("1. Authentication & session");

  const unauth = await api("GET", "/api/dashboard");
  eq(unauth.status, 401, "unauthenticated /api/dashboard is rejected");

  const regA = await api("POST", "/api/auth/register", {
    body: { name: "Acceptance A", email: emailA, password },
  });
  eq(regA.status, 200, "register user A");
  const cookieA = regA.cookie;
  const userA = data(regA)?.user;
  check(!!cookieA, "register sets session cookie");
  check(!!userA?.id, "register returns user id");

  const regB = await api("POST", "/api/auth/register", {
    body: { name: "Acceptance B", email: emailB, password },
  });
  eq(regB.status, 200, "register user B");
  const cookieB = regB.cookie;
  const userB = data(regB)?.user;

  const me = await api("GET", "/api/auth/me", { cookie: cookieA });
  eq(me.status, 200, "GET /api/auth/me with session");
  eq(data(me)?.user?.email ?? data(me)?.email, emailA, "/api/auth/me returns the right user");

  const badLogin = await api("POST", "/api/auth/login", {
    body: { email: emailA, password: "wrong-password" },
  });
  eq(badLogin.status, 401, "wrong password is rejected");

  // ═══════════════════════════════════════════════════════════════════════
  section("2. Customers");

  const cust = await api("POST", "/api/customers", {
    cookie: cookieA,
    body: { name: "Acceptance Customer", phone: "03001234567", openingBalance: 1000 },
  });
  eq(cust.status, 201, "create customer");
  const customerId = data(cust)?.id;
  check(!!customerId, "customer id returned");

  const custRead = await api("GET", `/api/customers/${customerId}`, { cookie: cookieA });
  eq(custRead.status, 200, "read customer");
  eq(data(custRead)?.balance, "1000", "opening balance is the starting balance");

  const badCustomer = await api("POST", "/api/customers", {
    cookie: cookieA,
    body: { name: "" },
  });
  eq(badCustomer.status, 400, "empty customer name is rejected");

  const malformed = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA ?? "" },
    body: "{not valid json",
  });
  eq(malformed.status, 400, "malformed JSON is rejected as a client error");

  const custList = await api("GET", "/api/customers?withBalances=1", { cookie: cookieA });
  eq(custList.status, 200, "list customers with balances");
  eq((data(custList) ?? []).length, 1, "customer list has exactly the created customer");

  // Baseline dashboard BEFORE any sale — used later to prove cache invalidation.
  const dashBefore = await api("GET", "/api/dashboard", { cookie: cookieA });
  eq(dashBefore.status, 200, "dashboard before sales");
  eq(data(dashBefore)?.totalReceivables, "1000", "dashboard receivables = opening balance");
  eq(data(dashBefore)?.todaysSales, "0", "dashboard sales start at zero");

  // ═══════════════════════════════════════════════════════════════════════
  section("3. Products & stock");

  const prod = await api("POST", "/api/products", {
    cookie: cookieA,
    body: {
      name: "Acceptance Rice",
      category: "Grains",
      purchasePrice: 100,
      sellingPrice: 150,
      unit: "kg",
      openingStock: 20,
      lowStockThreshold: 2,
    },
  });
  eq(prod.status, 201, "create product");
  const productId = data(prod)?.id;

  const prodRead = await api("GET", `/api/products/${productId}`, { cookie: cookieA });
  eq(prodRead.status, 200, "read product");
  eq(data(prodRead)?.currentStock, "20", "opening stock is 20");

  // ═══════════════════════════════════════════════════════════════════════
  section("4. Sale (credit + partial payment)");

  const sale = await api("POST", "/api/sales", {
    cookie: cookieA,
    body: {
      customerId,
      items: [{ productId, quantity: 5, unitPrice: 150 }],
      paidAmount: 200,
      paymentMethod: "cash",
    },
  });
  eq(sale.status, 201, "create sale");
  const saleId = data(sale)?.id;
  eq(data(sale)?.totalAmount, "750", "sale total = 5 × 150");
  eq(data(sale)?.paidAmount, "200", "sale records the amount received");
  eq(data(sale)?.outstanding, "550", "sale outstanding = 750 − 200");

  const custAfterSale = await api("GET", `/api/customers/${customerId}`, { cookie: cookieA });
  eq(data(custAfterSale)?.balance, "1550", "customer ledger: 1000 + 750 − 200");
  eq(data(custAfterSale)?.totalPurchases, "750", "customer total purchases updated");

  const prodAfterSale = await api("GET", `/api/products/${productId}`, { cookie: cookieA });
  eq(data(prodAfterSale)?.currentStock, "15", "stock after sale: 20 − 5");

  const dashAfterSale = await api("GET", "/api/dashboard", { cookie: cookieA });
  eq(data(dashAfterSale)?.todaysSales, "750", "dashboard reflects the sale immediately");
  eq(data(dashAfterSale)?.totalReceivables, "1550", "dashboard receivables updated immediately");

  const overpay = await api("POST", "/api/sales", {
    cookie: cookieA,
    body: {
      customerId,
      items: [{ productId, quantity: 1, unitPrice: 150 }],
      paidAmount: 999,
    },
  });
  eq(overpay.status, 400, "paid amount above the total is rejected");

  const missingCustomer = await api("POST", "/api/sales", {
    cookie: cookieA,
    body: {
      customerId: "does-not-exist",
      items: [{ productId, quantity: 1, unitPrice: 150 }],
      paidAmount: 0,
    },
  });
  eq(missingCustomer.status, 404, "sale for a nonexistent customer is rejected");

  // ═══════════════════════════════════════════════════════════════════════
  section("5. Payment");

  const payment = await api("POST", "/api/payments", {
    cookie: cookieA,
    body: { customerId, saleId, amount: 300, method: "cash" },
  });
  eq(payment.status, 201, "record payment against the sale");

  const custAfterPayment = await api("GET", `/api/customers/${customerId}`, { cookie: cookieA });
  eq(data(custAfterPayment)?.balance, "1250", "customer ledger: 1550 − 300");

  const saleAfterPayment = await api("GET", `/api/sales/${saleId}`, { cookie: cookieA });
  eq(data(saleAfterPayment)?.paidAmount, "500", "sale paid amount = 200 + 300");
  eq(data(saleAfterPayment)?.outstanding, "250", "sale outstanding = 750 − 500");

  const dashAfterPayment = await api("GET", "/api/dashboard", { cookie: cookieA });
  eq(data(dashAfterPayment)?.todaysPayments, "500", "dashboard cash received = 200 + 300");

  // ═══════════════════════════════════════════════════════════════════════
  section("6. Expenses & profit / loss");

  const expense = await api("POST", "/api/expenses", {
    cookie: cookieA,
    body: { name: "Acceptance transport", amount: 100, category: "transport" },
  });
  eq(expense.status, 201, "record expense");
  const expenseId = data(expense)?.id;

  const pl = await api("GET", "/api/dashboard/profit-loss", { cookie: cookieA });
  eq(pl.status, 200, "profit & loss endpoint");
  const allTime = data(pl)?.allTime;
  eq(allTime?.revenue, "750", "P&L revenue = billed sales");
  eq(allTime?.cogs, "500", "P&L COGS = 5 × purchase price");
  eq(allTime?.grossProfit, "250", "P&L gross profit = 750 − 500");
  eq(allTime?.expenses, "100", "P&L expenses");
  eq(allTime?.netProfit, "150", "P&L net profit = 250 − 100");

  const dashAfterExpense = await api("GET", "/api/dashboard", { cookie: cookieA });
  eq(data(dashAfterExpense)?.todaysExpenses, "100", "dashboard expenses updated immediately");

  // ═══════════════════════════════════════════════════════════════════════
  section("7. Suppliers, purchases & payables");

  const supplier = await api("POST", "/api/suppliers", {
    cookie: cookieA,
    body: { name: "Acceptance Supplier", phone: "03009876543" },
  });
  eq(supplier.status, 201, "create supplier");
  const supplierId = data(supplier)?.id;

  const purchase = await api("POST", `/api/suppliers/${supplierId}/purchases`, {
    cookie: cookieA,
    body: {
      items: [{ productId, quantity: 10, unitCost: 90 }],
      paidAmount: 400,
    },
  });
  eq(purchase.status, 201, "record purchase (10 × 90, 400 paid)");
  eq(data(purchase)?.totalAmount, "900", "purchase total = 10 × 90");
  eq(data(purchase)?.outstanding, "500", "purchase outstanding = 900 − 400");

  const supplierRead = await api("GET", `/api/suppliers/${supplierId}`, { cookie: cookieA });
  eq(data(supplierRead)?.balance, "500", "supplier payable = 900 − 400");

  const prodAfterPurchase = await api("GET", `/api/products/${productId}`, { cookie: cookieA });
  eq(data(prodAfterPurchase)?.currentStock, "25", "stock after purchase: 15 + 10");

  const supplierPayment = await api("POST", `/api/suppliers/${supplierId}/payments`, {
    cookie: cookieA,
    body: { amount: 200, method: "bank" },
  });
  eq(supplierPayment.status, 201, "pay supplier 200");

  const supplierAfterPayment = await api("GET", `/api/suppliers/${supplierId}`, { cookie: cookieA });
  eq(data(supplierAfterPayment)?.balance, "300", "supplier payable = 500 − 200");

  const supplierOverpay = await api("POST", `/api/suppliers/${supplierId}/payments`, {
    cookie: cookieA,
    body: { amount: 9999, method: "cash" },
  });
  eq(supplierOverpay.status, 400, "supplier overpayment is rejected");

  // ═══════════════════════════════════════════════════════════════════════
  section("8. Reports");

  const report = await api("GET", "/api/reports?preset=month", { cookie: cookieA });
  eq(report.status, 200, "monthly report");
  eq(data(report)?.sales?.billed, "750", "report sales billed");
  eq(data(report)?.sales?.cashReceived, "500", "report cash received");
  eq(data(report)?.purchases?.billed, "900", "report purchases billed");
  eq(data(report)?.expenses?.total, "100", "report expenses");
  eq(data(report)?.profit?.revenue, "750", "report profit block matches P&L");
  eq(data(report)?.position?.receivables, "1250", "report receivables");
  eq(data(report)?.position?.payables, "300", "report payables");

  // ═══════════════════════════════════════════════════════════════════════
  section("9. Reminders");

  const reminder = await api("POST", "/api/reminders", {
    cookie: cookieA,
    body: {
      title: "Acceptance follow-up",
      type: "customer_followup",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      customerId,
    },
  });
  eq(reminder.status, 201, "create reminder");
  const reminderId = data(reminder)?.id;

  const completed = await api("PATCH", `/api/reminders/${reminderId}`, {
    cookie: cookieA,
    body: { completed: true },
  });
  eq(completed.status, 200, "complete reminder");
  check(!!data(completed)?.completedAt, "reminder is marked complete (completedAt set)");

  const reminderList = await api("GET", "/api/reminders", { cookie: cookieA });
  eq(reminderList.status, 200, "list reminders");

  // ═══════════════════════════════════════════════════════════════════════
  section("10. Tenant isolation");

  const bCustomers = await api("GET", "/api/customers?withBalances=1", { cookie: cookieB });
  eq(bCustomers.status, 200, "user B can list customers");
  eq((data(bCustomers) ?? []).length, 0, "user B sees none of user A's customers");

  const bReadCustomer = await api("GET", `/api/customers/${customerId}`, { cookie: cookieB });
  eq(bReadCustomer.status, 404, "user B cannot read user A's customer");

  const bReadSale = await api("GET", `/api/sales/${saleId}`, { cookie: cookieB });
  eq(bReadSale.status, 404, "user B cannot read user A's sale");

  const bReadProduct = await api("GET", `/api/products/${productId}`, { cookie: cookieB });
  eq(bReadProduct.status, 404, "user B cannot read user A's product");

  const bReadSupplier = await api("GET", `/api/suppliers/${supplierId}`, { cookie: cookieB });
  eq(bReadSupplier.status, 404, "user B cannot read user A's supplier");

  const bDashboard = await api("GET", "/api/dashboard", { cookie: cookieB });
  eq(data(bDashboard)?.customerCount, 0, "user B dashboard is empty");

  // ═══════════════════════════════════════════════════════════════════════
  section("11. Void propagation");

  // While the sale and its payments are active, the customer must not be deletable.
  const deleteBlocked = await api("DELETE", `/api/customers/${customerId}`, { cookie: cookieA });
  check(
    deleteBlocked.status === 400 || deleteBlocked.status === 409,
    "customer with active ledger history cannot be deleted",
    `got ${deleteBlocked.status}`,
  );

  const voidSale = await api("POST", `/api/sales/${saleId}?action=void`, { cookie: cookieA });
  eq(voidSale.status, 200, "void the sale");

  // Voiding a sale reverses the sale AND every payment linked to it (the UI
  // warns about this), so both the 200 at-sale payment and the later 300 are
  // reversed: 1000 opening + 0 sales − 0 payments = 1000.
  const custAfterVoid = await api("GET", `/api/customers/${customerId}`, { cookie: cookieA });
  eq(data(custAfterVoid)?.balance, "1000", "balance after void: sale and linked payments reversed");

  const prodAfterVoid = await api("GET", `/api/products/${productId}`, { cookie: cookieA });
  eq(data(prodAfterVoid)?.currentStock, "30", "stock restored after void: 20 + 10");

  const plAfterVoid = await api("GET", "/api/dashboard/profit-loss", { cookie: cookieA });
  eq(data(plAfterVoid)?.allTime?.revenue, "0", "P&L revenue drops to zero after void");
  eq(data(plAfterVoid)?.allTime?.netProfit, "-100", "P&L net profit = 0 − 100 expenses");

  const voidExpense = await api("POST", `/api/expenses/${expenseId}?action=void`, { cookie: cookieA });
  eq(voidExpense.status, 200, "void the expense");

  const plAfterExpenseVoid = await api("GET", "/api/dashboard/profit-loss", { cookie: cookieA });
  eq(data(plAfterExpenseVoid)?.allTime?.expenses, "0", "P&L expenses drop to zero");
  eq(data(plAfterExpenseVoid)?.allTime?.netProfit, "0", "P&L net profit returns to zero");

  // ═══════════════════════════════════════════════════════════════════════
  section("12. Edit persistence & delete");

  const renamed = await api("PATCH", `/api/customers/${customerId}`, {
    cookie: cookieA,
    body: { name: "Acceptance Customer Renamed" },
  });
  eq(renamed.status, 200, "update customer name");

  const reread = await api("GET", `/api/customers/${customerId}`, { cookie: cookieA });
  eq(data(reread)?.name, "Acceptance Customer Renamed", "updated name persists");

  // All transactions are voided now, so a soft delete is allowed.
  const deleted = await api("DELETE", `/api/customers/${customerId}`, { cookie: cookieA });
  eq(deleted.status, 200, "customer with only voided history can be deleted");

  const afterDelete = await api("GET", `/api/customers/${customerId}`, { cookie: cookieA });
  eq(afterDelete.status, 404, "deleted customer is no longer readable");

  // ═══════════════════════════════════════════════════════════════════════
  section("13. Smart entry (interpret must never write)");

  const salesBefore = await api("GET", "/api/sales?filter=all", { cookie: cookieA });
  const countBefore = (data(salesBefore) ?? []).length;

  const unauthInterpret = await api("POST", "/api/smart-entry/interpret", {
    body: { text: "sold 2 kg rice to someone for 300" },
  });
  eq(unauthInterpret.status, 401, "smart entry requires a session");

  // The live interpretation calls Gemini, which is an external service. Its
  // availability must not decide whether the rest of the suite passes, so a
  // timeout or upstream error is reported as "skipped" rather than "failed".
  // (The write path is still guarded below: interpret must never write.)
  try {
    const interpret = await api("POST", "/api/smart-entry/interpret", {
      cookie: cookieA,
      body: { text: "sold 2 kg rice to Nobody Here for 300" },
      timeoutMs: 45_000,
    });
    if (interpret.status === 200) {
      check(
        typeof data(interpret)?.status === "string",
        "live AI interpret returns a status",
        JSON.stringify(data(interpret)).slice(0, 160),
      );
    } else {
      skip("live AI interpret", `upstream returned ${interpret.status}`);
    }
  } catch (error) {
    skip("live AI interpret", `external AI unavailable (${String(error).slice(0, 80)})`);
  }

  const executeWithoutSession = await api("POST", "/api/smart-entry/execute", {
    cookie: cookieA,
    body: { sessionId: "not-a-real-session", confirm: true },
  });
  check(
    executeWithoutSession.status === 400 || executeWithoutSession.status === 404,
    "execute without a pending session is rejected",
    `got ${executeWithoutSession.status}`,
  );

  const salesAfter = await api("GET", "/api/sales?filter=all", { cookie: cookieA });
  eq((data(salesAfter) ?? []).length, countBefore, "interpret created no sale");

  // ═══════════════════════════════════════════════════════════════════════
  section("14. Admin & subscription");

  const adminNoSecret = await api("GET", "/api/admin/codes");
  eq(adminNoSecret.status, 401, "admin API rejects a missing secret");

  const adminWrongSecret = await api("GET", "/api/admin/codes", {
    headers: { "x-admin-secret": "definitely-not-the-secret-1234" },
  });
  eq(adminWrongSecret.status, 401, "admin API rejects a wrong secret");

  const adminSecret = process.env.ADMIN_SECRET;
  check(!!adminSecret && adminSecret.length >= 16, "ADMIN_SECRET is configured for the test");

  let createdCodeId: string | null = null;
  let createdCode: string | null = null;
  if (adminSecret) {
    const codes = await api("GET", "/api/admin/codes", {
      headers: { "x-admin-secret": adminSecret },
    });
    eq(codes.status, 200, "admin API accepts the correct secret");

    const created = await api("POST", "/api/admin/codes", {
      headers: { "x-admin-secret": adminSecret },
      body: { durationDays: 30, maxRedemptions: 1, count: 1 },
    });
    eq(created.status, 200, "admin can generate a redeem code");
    const generated = data(created) ?? [];
    createdCode = generated[0]?.code ?? null;
    createdCodeId = generated[0]?.id ?? null;
  }

  const subscription = await api("GET", "/api/subscription", { cookie: cookieA });
  eq(subscription.status, 200, "subscription status is readable");
  eq(data(subscription)?.billingEnabled, false, "billing is disabled");

  const badRedeem = await api("POST", "/api/subscription/redeem", {
    cookie: cookieA,
    body: { code: "DKH-0000-0000-0000" },
  });
  check(badRedeem.status === 400 || badRedeem.status === 404, "invalid redeem code is rejected", `got ${badRedeem.status}`);

  // ═══════════════════════════════════════════════════════════════════════
  section("15. Backup export");

  const backup = await api("GET", "/api/backup/export", { cookie: cookieA, timeoutMs: 60_000 });
  eq(backup.status, 200, "backup export responds");
  check(
    backup.json && Array.isArray(backup.json?.data?.customers),
    "backup contains a customers table",
    backup.text.slice(0, 120),
  );

  // ═══════════════════════════════════════════════════════════════════════
  section("16. Settings & custom units");

  const settingsRead = await api("GET", "/api/settings", { cookie: cookieA });
  eq(settingsRead.status, 200, "read settings");

  const settingsWrite = await api("PATCH", "/api/settings", {
    cookie: cookieA,
    body: {
      businessName: "Acceptance Shop",
      currency: "PKR",
      currencySymbol: "Rs",
      timezone: "Asia/Karachi",
    },
  });
  eq(settingsWrite.status, 200, "update settings");
  eq(data(settingsWrite)?.businessName, "Acceptance Shop", "business name saved");

  const settingsReread = await api("GET", "/api/settings", { cookie: cookieA });
  eq(data(settingsReread)?.businessName, "Acceptance Shop", "settings persist");

  const unitAdd = await api("POST", "/api/settings/units", {
    cookie: cookieA,
    body: { unit: "sack" },
  });
  eq(unitAdd.status, 200, "add a custom unit");
  check(
    (data(unitAdd)?.customUnits ?? []).includes("sack"),
    "custom unit is stored",
    JSON.stringify(data(unitAdd)),
  );

  const unitDuplicate = await api("POST", "/api/settings/units", {
    cookie: cookieA,
    body: { unit: "sack" },
  });
  eq(unitDuplicate.status, 400, "duplicate custom unit is rejected");

  // ═══════════════════════════════════════════════════════════════════════
  section("17. Transactions, audit & history");

  const recoveryCustomer = await api("POST", "/api/customers", {
    cookie: cookieA,
    body: { name: "Recovery Customer", phone: "03005556667" },
  });
  eq(recoveryCustomer.status, 201, "create a customer with an open balance");
  const recoveryCustomerId = data(recoveryCustomer)?.id;

  const recoverySale = await api("POST", "/api/sales", {
    cookie: cookieA,
    body: {
      customerId: recoveryCustomerId,
      items: [{ productId, quantity: 2, unitPrice: 150 }],
      paidAmount: 0,
    },
  });
  eq(recoverySale.status, 201, "record a fully-credit sale");

  const txList = await api("GET", "/api/transactions?filter=all", { cookie: cookieA });
  eq(txList.status, 200, "list transactions");
  const txRows = data(txList)?.transactions ?? [];
  check(Array.isArray(txRows) && txRows.length > 0, "transactions list is not empty");
  check(
    txRows.some((row: any) => row.type === "sale"),
    "sale appears in the transaction ledger",
  );

  const txSummary = await api("GET", "/api/transactions?filter=all&summary=1", {
    cookie: cookieA,
  });
  eq(txSummary.status, 200, "transaction summary");
  check(!!data(txSummary)?.summary, "summary block returned");

  const audit = await api("GET", "/api/audit", { cookie: cookieA });
  eq(audit.status, 200, "read audit log");
  check(
    (data(audit)?.items ?? []).some((row: any) => row.action === "customer.delete"),
    "customer delete was audited",
  );

  const history = await api("GET", `/api/customers/${recoveryCustomerId}/history`, {
    cookie: cookieA,
  });
  eq(history.status, 200, "customer history");
  check(
    Array.isArray(data(history)?.transactions),
    "history returns transaction rows",
    JSON.stringify(data(history)).slice(0, 160),
  );
  eq(data(history)?.customer?.balance, "300", "history customer balance matches the ledger");
  const historyRows = data(history)?.transactions ?? [];
  check(
    String(historyRows[historyRows.length - 1]?.runningBalance) === "300",
    "running balance in history ends at the current balance",
    JSON.stringify(historyRows[historyRows.length - 1]),
  );

  const expenseSummary = await api("GET", "/api/expenses/summary", { cookie: cookieA });
  eq(expenseSummary.status, 200, "expense summary");

  const stockMoves = await api("GET", "/api/stock/moves", { cookie: cookieA });
  eq(stockMoves.status, 200, "stock moves list");

  // ═══════════════════════════════════════════════════════════════════════
  section("18. Insights, growth, recovery & follow-ups");

  const insights = await api("GET", "/api/insights", { cookie: cookieA });
  eq(insights.status, 200, "insights endpoint");
  check(!!data(insights), "insights return data");

  const growth = await api("GET", "/api/growth", { cookie: cookieA });
  eq(growth.status, 200, "growth plan endpoint");
  check(
    JSON.stringify(data(growth)).includes("Recovery Customer"),
    "growth plan uses this business's own customer",
  );

  const growthSummary = await api("POST", "/api/growth/summary", {
    cookie: cookieA,
    body: {},
    timeoutMs: 90_000,
  });
  eq(growthSummary.status, 200, "growth narration endpoint");
  check(!!data(growthSummary), "growth narration returns data");

  const recovery = await api("GET", "/api/recovery", { cookie: cookieA });
  eq(recovery.status, 200, "recovery list");
  check(
    JSON.stringify(data(recovery)).includes("Recovery Customer"),
    "recovery list includes the customer who owes money",
  );

  const contact = await api("POST", "/api/recovery/contact", {
    cookie: cookieA,
    body: { customerId: recoveryCustomerId, method: "whatsapp", notes: "called" },
  });
  eq(contact.status, 201, "log a recovery contact");

  const remind = await api("POST", "/api/recovery/remind", {
    cookie: cookieA,
    body: { customerId: recoveryCustomerId, days: 3 },
  });
  eq(remind.status, 201, "create a recovery reminder");

  const candidates = await api("GET", "/api/follow-ups/candidates", { cookie: cookieA });
  eq(candidates.status, 200, "follow-up candidates");
  check(Array.isArray(data(candidates)?.items), "candidates return a list");

  const followUp = await api("POST", "/api/follow-ups", {
    cookie: cookieA,
    body: {
      customerId: recoveryCustomerId,
      reason: "Owes 300 and usually buys every week",
      message: "Assalam o Alaikum, your balance is Rs. 300.",
    },
  });
  check(
    followUp.status === 201 || followUp.status === 200,
    "create a follow-up opportunity",
    `got ${followUp.status}`,
  );
  const followUpId = data(followUp)?.followUp?.id ?? data(followUp)?.id;

  const followUpUpdate = await api("PATCH", `/api/follow-ups/${followUpId}`, {
    cookie: cookieA,
    body: { outcome: "contacted" },
  });
  eq(followUpUpdate.status, 200, "record a follow-up outcome");
  eq(data(followUpUpdate)?.outcome, "contacted", "outcome is stored");

  const followUpList = await api("GET", "/api/follow-ups?filter=open", { cookie: cookieA });
  eq(followUpList.status, 200, "list open follow-ups");
  check(Array.isArray(data(followUpList)?.items), "follow-ups return a list");

  // ═══════════════════════════════════════════════════════════════════════
  section("19. Subscription redemption");

  if (createdCode) {
    const redeemed = await api("POST", "/api/subscription/redeem", {
      cookie: cookieA,
      body: { code: createdCode },
    });
    eq(redeemed.status, 200, "redeem a valid admin code");

    const subAfter = await api("GET", "/api/subscription", { cookie: cookieA });
    eq(subAfter.status, 200, "subscription after redemption");
    check(!!data(subAfter), "subscription returns data");

    const redeemAgain = await api("POST", "/api/subscription/redeem", {
      cookie: cookieA,
      body: { code: createdCode },
    });
    eq(redeemAgain.status, 400, "a single-use code cannot be redeemed twice");

    const subHistory = await api("GET", "/api/subscription/history", { cookie: cookieA });
    eq(subHistory.status, 200, "subscription history");
    check(
      (data(subHistory)?.items ?? data(subHistory) ?? []).length > 0,
      "redemption appears in subscription history",
    );
  } else {
    check(false, "a redeem code was generated for the redemption test");
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("20. Backup restore round-trip & CSV");

  const exportAgain = await api("GET", "/api/backup/export", {
    cookie: cookieA,
    timeoutMs: 60_000,
  });
  eq(exportAgain.status, 200, "export before restore");
  const exportedCustomers = exportAgain.json?.data?.customers ?? [];

  const customersBefore = await api("GET", "/api/customers?withBalances=1", { cookie: cookieA });
  const countBeforeRestore = (data(customersBefore) ?? []).length;

  const restored = await api("POST", "/api/backup/import", {
    cookie: cookieA,
    body: { content: exportAgain.text, confirmReplace: true },
    timeoutMs: 120_000,
  });
  eq(restored.status, 200, "restore the backup into the same account");

  const customersAfter = await api("GET", "/api/customers?withBalances=1", { cookie: cookieA });
  eq(
    (data(customersAfter) ?? []).length,
    countBeforeRestore,
    "customer count survives a restore",
  );

  const restoredCustomer = (data(customersAfter) ?? []).find(
    (row: any) => row.id === recoveryCustomerId,
  );
  eq(restoredCustomer?.balance, "300", "restored ledger keeps the open balance");
  check(
    exportedCustomers.length >= countBeforeRestore,
    "backup contains the exported customers",
  );

  const csv = await api("GET", "/api/backup/csv/customers", { cookie: cookieA });
  eq(csv.status, 200, "CSV export responds");
  check(csv.text.includes("Recovery Customer"), "CSV contains the customer row");

  // ═══════════════════════════════════════════════════════════════════════
  section("Cleanup");

  try {
    if (createdCodeId) {
      const { rawPrisma } = await import("../src/lib/db/prisma");
      await rawPrisma.$executeRawUnsafe(`DELETE FROM "RedeemCode" WHERE id = $1`, createdCodeId);
      await rawPrisma.$disconnect();
    }
  } catch {
    /* ignore */
  }
  if (userA?.id) await cleanupUser(userA.id);
  if (userB?.id) await cleanupUser(userB.id);
  console.log(`  removed test users ${emailA} and ${emailB}`);

  // ─── summary ───────────────────────────────────────────────────────────
  console.log(
    `\n\x1b[1mResult: ${passed} passed, ${failures.length} failed, ${skipped} skipped\x1b[0m`,
  );
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ✗ ${f.name} — ${f.detail}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\x1b[31mFATAL:\x1b[0m", error);
  process.exit(1);
});
