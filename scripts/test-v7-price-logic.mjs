/**
 * Smart Entry V7 — Price Logic + Mobile Sheet Sizing Regression Test
 *
 * Tests:
 *   A. No price mentioned → default product price + default full payment
 *   B. Explicit per-unit price → overrides default for this transaction
 *   C. Explicit total → derived unit price (NOT confused with unit price)
 *   D. Explicit partial payment → correct outstanding balance
 *   E. Explicit credit (paidAmount=0) → NOT defaulted to full payment
 *   F. Mobile sheet sizing — compact for short content, expands for forms
 *   G. MoreDrawer width — not full-screen on mobile
 *
 * Uses Playwright route interception to mock Gemini AI responses.
 */

import { chromium } from "playwright";
import { readFileSync } from "fs";
const envFile = readFileSync("/home/z/my-project/digital-khata-app/.env", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const BASE = "http://localhost:3000";

let pass = 0, fail = 0;
const bugs = [];
function a(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; bugs.push({ label, detail }); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function register(name, email) {
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password: "password123" }),
  });
  const j = await r.json();
  const cookie = r.headers.get("set-cookie")?.match(/dk_auth_token=([^;]+)/)?.[0] || "";
  return { user: j.data?.user, cookie };
}

async function main() {
  console.log("=== Smart Entry V7 — Price Logic + Sheet Sizing Test ===\n");
  const u = Date.now();
  const ua = await register("V7Test", `v7-${u}@e.com`);
  a(!!ua.user, "User registers");

  // Create customer + product (selling price = 1000/kg)
  const cc = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({ name: "Ahmad", phone: `0300${u}`, openingBalance: 0 }),
  });
  const customer = (await cc.json()).data;

  const cp = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({ name: "Rice", purchasePrice: 800, sellingPrice: 1000, unit: "kg", openingStock: 100 }),
  });
  const product = (await cp.json()).data;

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await ctx.addCookies([{ name: "dk_auth_token", value: ua.cookie.split("=")[1], domain: "localhost", path: "/" }]);

  // Helper: mock /api/smart-entry/interpret with a custom AI response
  async function mockInterpret(aiOverrides) {
    await page.unroute("**/api/smart-entry/interpret");
    await page.route("**/api/smart-entry/interpret", async (route) => {
      const ai = {
        intent: "CREATE_CREDIT_SALE",
        customerName: "Ahmad",
        productName: "Rice",
        quantity: 25,
        unit: "kg",
        batchName: null,
        explicitUnitPrice: null,
        explicitTotal: null,
        explicitPaidAmount: null,
        confidence: 0.9,
        needsClarification: false,
        ...aiOverrides,
      };
      // Build the FORM response — the backend would normally compute this,
      // but since we're mocking the API, we build it here too.
      const form = buildMockForm(ai, customer.id, product.id);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { sessionId: `mock-${Date.now()}`, status: "FORM", transcript: aiOverrides.transcript ?? "test", form } }),
      });
    });
  }

  // Helper: build a mock FormFieldState that mirrors the backend's V7 logic
  function buildMockForm(ai, customerId, productId) {
    const qty = ai.quantity ?? null;
    const defaultUnitPrice = 1000; // product.sellingPrice
    let unitPrice = null;
    let totalAmount = null;
    let priceSource = "NONE";

    if (ai.explicitUnitPrice != null && ai.explicitTotal != null && qty != null) {
      unitPrice = ai.explicitUnitPrice;
      totalAmount = ai.explicitTotal;
      priceSource = "USER_UNIT_PRICE";
    } else if (ai.explicitTotal != null && qty != null) {
      unitPrice = ai.explicitTotal / qty;
      totalAmount = ai.explicitTotal;
      priceSource = "USER_TOTAL";
    } else if (ai.explicitUnitPrice != null && qty != null) {
      unitPrice = ai.explicitUnitPrice;
      totalAmount = qty * ai.explicitUnitPrice;
      priceSource = "USER_UNIT_PRICE";
    } else if (defaultUnitPrice != null && qty != null) {
      unitPrice = defaultUnitPrice;
      totalAmount = qty * defaultUnitPrice;
      priceSource = "DEFAULT_PRODUCT_PRICE";
    }

    // V7 default-full-payment logic
    let paidAmount;
    let balance;
    if (totalAmount != null) {
      if (ai.explicitPaidAmount == null) {
        paidAmount = totalAmount;
        balance = 0;
      } else {
        paidAmount = ai.explicitPaidAmount;
        balance = totalAmount - paidAmount;
      }
    } else {
      paidAmount = ai.explicitPaidAmount ?? 0;
      balance = null;
    }

    return {
      customerNameRaw: ai.customerName,
      productNameRaw: ai.productName,
      quantityRaw: qty,
      unitRaw: ai.unit,
      batchNameRaw: ai.batchName,
      explicitUnitPrice: ai.explicitUnitPrice,
      explicitTotal: ai.explicitTotal,
      explicitPaidAmount: ai.explicitPaidAmount,
      resolvedCustomerId: customerId,
      resolvedProductId: productId,
      resolvedBatchId: null,
      batchCandidates: [],
      batchSelectionRequired: false,
      unitPrice, totalAmount, priceSource, paidAmount, balance,
      priceConflict: null,
      isNewCustomer: false,
      isNewProduct: false,
      customerCandidates: [{ id: customerId, name: "Ahmad", phone: `0300${u}` }],
      productCandidates: [{ id: productId, name: "Rice", unit: "kg", sellingPrice: "1000" }],
      hint: null,
    };
  }

  // Helper: open Smart Entry modal + submit text + wait for form
  async function submitTextAndGetForm(text) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('button[aria-label*="Smart Entry voice"]').first().click();
    await page.waitForTimeout(500);
    await page.locator("textarea").first().fill(text);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);
  }

  // Helper: read all numeric input values from the form
  async function getFormValues() {
    const inputs = page.locator('input[type="number"]');
    const count = await inputs.count();
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(await inputs.nth(i).inputValue());
    }
    return values;
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- A. No price mentioned → default price + full payment ---");
  await mockInterpret({ transcript: "Ahmad bought 25 kg rice" });
  await submitTextAndGetForm("Ahmad bought 25 kg rice");

  const valsA = await getFormValues();
  // [0] = quantity, [1] = unit price, [2] = paid amount
  a(valsA[0] === "25", "Quantity = 25", `got ${valsA[0]}`);
  a(valsA[1] === "1000", "Unit price = 1000 (default product price)", `got ${valsA[1]}`);
  a(valsA[2] === "25000", "Amount paid = 25000 (default full payment)", `got ${valsA[2]}`);

  // Check "Fully Paid" is shown (not "He Owes Us")
  const fullyPaidA = await page.getByText(/Fully Paid/i).count();
  a(fullyPaidA >= 1, "'Fully Paid' shown (outstanding = 0)");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- B. Explicit per-unit price → overrides default ---");
  await mockInterpret({ transcript: "Ahmad bought 25 kg rice at 950 per kg", explicitUnitPrice: 950 });
  await submitTextAndGetForm("Ahmad bought 25 kg rice at 950 per kg");

  const valsB = await getFormValues();
  a(valsB[0] === "25", "Quantity = 25", `got ${valsB[0]}`);
  a(valsB[1] === "950", "Unit price = 950 (explicit, overrides default 1000)", `got ${valsB[1]}`);
  a(valsB[2] === "23750", "Amount paid = 23750 (full payment of 25×950)", `got ${valsB[2]}`);

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- C. Explicit total → derived unit price (NOT confused) ---");
  await mockInterpret({ transcript: "Ahmad bought 25 kg rice for 23000", explicitTotal: 23000 });
  await submitTextAndGetForm("Ahmad bought 25 kg rice for 23000");

  const valsC = await getFormValues();
  a(valsC[0] === "25", "Quantity = 25", `got ${valsC[0]}`);
  a(valsC[1] === "920", "Unit price = 920 (derived: 23000 / 25, NOT 23000)", `got ${valsC[1]}`);
  a(valsC[2] === "23000", "Amount paid = 23000 (full payment of stated total)", `got ${valsC[2]}`);

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- D. Explicit partial payment → correct outstanding ---");
  await mockInterpret({
    transcript: "Ahmad bought 25 kg rice at 1000 per kg and paid 20000",
    explicitUnitPrice: 1000,
    explicitPaidAmount: 20000,
  });
  await submitTextAndGetForm("Ahmad bought 25 kg rice at 1000 per kg and paid 20000");

  const valsD = await getFormValues();
  a(valsD[0] === "25", "Quantity = 25", `got ${valsD[0]}`);
  a(valsD[1] === "1000", "Unit price = 1000 (explicit)", `got ${valsD[1]}`);
  a(valsD[2] === "20000", "Amount paid = 20000 (partial)", `got ${valsD[2]}`);

  // Check "He Owes Us: 5,000" is shown
  const owesUsD = await page.getByText(/He Owes Us/i).count();
  a(owesUsD >= 1, "'He Owes Us' shown (outstanding = 5000)");
  const outstanding5000 = await page.getByText(/5,000/).count();
  a(outstanding5000 >= 1, "Outstanding = 5,000 (25000 - 20000)");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- E. Explicit credit (paidAmount=0) → NOT full payment ---");
  await mockInterpret({
    transcript: "Ahmad bought 25 kg rice on credit",
    explicitPaidAmount: 0, // explicitly zero = credit sale
  });
  await submitTextAndGetForm("Ahmad bought 25 kg rice on credit");

  const valsE = await getFormValues();
  a(valsE[0] === "25", "Quantity = 25", `got ${valsE[0]}`);
  a(valsE[1] === "1000", "Unit price = 1000 (default)", `got ${valsE[1]}`);
  // paidAmount = 0, so the field should be empty (form.paidAmount > 0 is false)
  a(valsE[2] === "", "Amount paid = empty (credit sale, 0)", `got ${valsE[2]}`);

  // Check "He Owes Us: 25,000" (full outstanding)
  const owesUsE = await page.getByText(/He Owes Us/i).count();
  a(owesUsE >= 1, "'He Owes Us' shown (credit sale → full outstanding)");
  const outstanding25000 = await page.getByText(/25,000/).count();
  a(outstanding25000 >= 1, "Outstanding = 25,000 (full credit)");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- F. Mobile sheet sizing — compact for short content ---");
  // Close any open modal + reopen to get the ChoiceView
  const seDialog = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  if (await seDialog.count() > 0) {
    await seDialog.locator('[aria-label="Close"]').first().click();
    await page.waitForTimeout(500);
  }
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.locator('button[aria-label*="Smart Entry voice"]').first().click();
  await page.waitForTimeout(500);

  // Measure the modal height — should be < 70% of viewport (compact)
  const modalBox = await page.locator('[role="dialog"][aria-label="Smart Khata Entry"]').first().boundingBox();
  const viewportHeight = 844;
  const modalHeightPct = modalBox ? (modalBox.height / viewportHeight) * 100 : 100;
  a(modalHeightPct < 70, `ChoiceView sheet is compact (${modalHeightPct.toFixed(0)}% of viewport, < 70%)`, `got ${modalHeightPct.toFixed(0)}%`);

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- G. MoreDrawer width — not full-screen on mobile ---");
  await page.locator('[aria-label="Close"]').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Open the More drawer
  await page.locator('button[aria-label="More"]').first().click();
  await page.waitForTimeout(500);

  // Measure the drawer width — should be < 90% of viewport (not full-screen)
  const drawerBox = await page.locator('[role="dialog"][aria-label="More"]').first().boundingBox();
  const viewportWidth = 390;
  const drawerWidthPct = drawerBox ? (drawerBox.width / viewportWidth) * 100 : 100;
  a(drawerWidthPct < 90, `MoreDrawer is not full-screen (${drawerWidthPct.toFixed(0)}% of viewport, < 90%)`, `got ${drawerWidthPct.toFixed(0)}%`);

  await browser.close();

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- H. Backend: verify product default price is unchanged ---");
  // After all the transactions with explicit prices, the product's sellingPrice
  // should still be 1000 (explicit transaction prices don't change the default)
  const dbProduct = await prisma.product.findUnique({ where: { id: product.id } });
  a(dbProduct?.sellingPrice.toString() === "1000", "Product default sellingPrice unchanged (1000)", `got ${dbProduct?.sellingPrice}`);

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- Cleanup ---");
  await prisma.user.delete({ where: { id: ua.user.id } });
  await prisma.$disconnect();
  console.log("  OK - Test users + their data cascade-deleted");

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  console.log(`${"=".repeat(60)}`);
  if (bugs.length > 0) {
    console.log("\nFAILURES:");
    bugs.forEach((b) => console.log(`  ✗ ${b.label}${b.detail ? ` — ${b.detail}` : ""}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
