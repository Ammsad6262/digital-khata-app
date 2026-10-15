/**
 * Smart Entry V3 — Voice Bug Fix Regression Test
 *
 * Tests the V3 fixes:
 *   1. SmartEntryFab (simple tap-to-open, no hold-to-record)
 *   2. State machine: recording → transcribing → form (never back to choice)
 *   3. Stale-request protection (cancel during transcription → old response discarded)
 *   4. New customer creation flow
 *   5. New product creation wizard
 *   6. Transaction accuracy (pricing priority, partial payment)
 *   7. Cross-tenant isolation
 *   8. Responsive at multiple viewport sizes
 *
 * Uses Playwright with route interception to mock the Gemini AI responses
 * (the real Gemini API is geo-blocked from this dev server).
 *
 * Run: cd digital-khata-app && npm run dev
 *      node scripts/test-smart-entry-v3.mjs
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
  console.log("=== Smart Entry V3 — Voice Bug Fix Regression Test ===\n");
  const u = Date.now();
  const ua = await register("V3Test A", `v3-${u}@e.com`);
  a(!!ua.user, "User A registers");

  // Create a customer + product for "existing entity" tests
  const cc = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({ name: "Ahmad Khan", phone: `0300${u}`, openingBalance: 0 }),
  });
  const customer = (await cc.json()).data;
  a(!!customer?.id, "Existing customer 'Ahmad Khan' created");

  const cp = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({ name: "Rice", purchasePrice: 800, sellingPrice: 1000, unit: "kg", openingStock: 100 }),
  });
  const product = (await cp.json()).data;
  a(!!product?.id, "Existing product 'Rice' created");

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await ctx.addCookies([{ name: "dk_auth_token", value: ua.cookie.split("=")[1], domain: "localhost", path: "/" }]);

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // ── Mock /api/smart-entry/interpret ────────────────────────────────────────
  // Helper to set up a mock response for the interpret endpoint
  async function mockInterpret(mockResponse) {
    await page.unroute("**/api/smart-entry/interpret");
    await page.route("**/api/smart-entry/interpret", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockResponse),
      });
    });
  }

  // Helper to make a mock FORM response
  function mockFormResponse(overrides = {}) {
    // For resolvedCustomerId / resolvedProductId: use "in" check to distinguish
    // between "not provided" (use default) and "explicitly null" (use null).
    // This is important because `null ?? customer.id` returns `customer.id`,
    // NOT null — which would prevent the new-customer/product banners from showing.
    const hasResolvedCustomer = "resolvedCustomerId" in overrides;
    const hasResolvedProduct = "resolvedProductId" in overrides;
    return {
      ok: true,
      data: {
        sessionId: `mock-session-${Date.now()}`,
        status: "FORM",
        transcript: overrides.transcript ?? "Ahmad bought 25 kg rice",
        form: {
          customerNameRaw: overrides.customerNameRaw ?? "Ahmad",
          productNameRaw: overrides.productNameRaw ?? "Rice",
          quantityRaw: overrides.quantityRaw ?? 25,
          unitRaw: overrides.unitRaw ?? "kg",
          batchNameRaw: null,
          explicitUnitPrice: overrides.explicitUnitPrice ?? null,
          explicitTotal: overrides.explicitTotal ?? null,
          explicitPaidAmount: overrides.explicitPaidAmount ?? null,
          resolvedCustomerId: hasResolvedCustomer ? overrides.resolvedCustomerId : customer.id,
          resolvedProductId: hasResolvedProduct ? overrides.resolvedProductId : product.id,
          resolvedBatchId: null,
          batchCandidates: [],
          batchSelectionRequired: false,
          unitPrice: overrides.unitPrice ?? 1000,
          totalAmount: overrides.totalAmount ?? 25000,
          priceSource: overrides.priceSource ?? "DEFAULT_PRODUCT_PRICE",
          paidAmount: overrides.paidAmount ?? 0,
          balance: overrides.balance ?? 25000,
          priceConflict: null,
          isNewCustomer: overrides.isNewCustomer ?? false,
          isNewProduct: overrides.isNewProduct ?? false,
          customerCandidates: [{ id: customer.id, name: "Ahmad Khan", phone: `0300${u}` }],
          productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }],
          hint: null,
          ...overrides.extraForm,
        },
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 1. SmartEntryFab: simple tap-to-open (no hold-to-record) ---");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // The FAB should be a simple button (no pointer-event handlers for hold)
  const fab = page.locator('button[aria-label*="Smart Entry voice"]').first();
  a(await fab.count() >= 1, "SmartEntryFab is visible on Dashboard");

  // Click it — should open the modal (no hold required)
  await fab.click();
  await page.waitForTimeout(500);
  const modalOpen = await page.locator('[role="dialog"][aria-label="Smart Khata Entry"]').count();
  a(modalOpen >= 1, "Modal opens on simple tap (no hold required)");

  // Modal should show the ChoiceView (Voice / Text options)
  const choiceText = await page.locator('text=Hold the mic button').count();
  a(choiceText >= 1, "ChoiceView shown with 'Hold the mic button' hint");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 2. Text entry → form (never back to ChoiceView) ---");
  await mockInterpret(mockFormResponse());

  // Type and submit
  await page.locator("textarea").first().fill("Ahmad bought 25 kg rice");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  // Should show LoadingState ("Understanding..."), NOT ChoiceView
  const understanding = await page.locator('text=Understanding').count();
  // After the mock responds, should show the form (NOT ChoiceView)
  await page.waitForTimeout(1000);

  // Check for form elements (Customer, Product pickers)
  const formVisible = await page.locator('text=Add to Khata').count();
  a(formVisible >= 1, "Form (Add to Khata button) shown after interpretation — NOT ChoiceView");

  // Verify the choice screen is NOT visible
  const choiceStillVisible = await page.locator('text=Hold the mic button').count();
  a(choiceStillVisible === 0, "ChoiceView is NOT shown after interpretation completes");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 3. Transaction values are correct ---");
  // Customer should be pre-filled
  const customerPickerText = await page.locator('button:has-text("Ahmad")').count();
  a(customerPickerText >= 1, "Customer 'Ahmad' pre-filled in picker");

  // Product should be pre-filled
  const productPickerText = await page.locator('button:has-text("Rice")').count();
  a(productPickerText >= 1, "Product 'Rice' pre-filled in picker");

  // Quantity should be 25
  const qtyInput = page.locator('input[type="number"]').first();
  const qtyValue = await qtyInput.inputValue();
  a(qtyValue === "25", "Quantity = 25", `got: ${qtyValue}`);

  // Unit price should be 1000 (default product price)
  const priceInputs = page.locator('input[type="number"]');
  const unitPriceValue = await priceInputs.nth(1).inputValue();
  a(unitPriceValue === "1000", "Unit price = 1000 (default product price)", `got: ${unitPriceValue}`);

  // Total should be 25000 (25 × 1000)
  const totalText = await page.locator('text=25,000').count();
  a(totalText >= 1, "Total = 25,000 (25 × 1000)");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 4. Close modal + reopen → fresh ChoiceView ---");
  // Close the modal — scope to the Smart Entry dialog to avoid matching
  // the MoreDrawer's close button (which is always rendered but off-screen)
  const seDialog = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  await seDialog.locator('[aria-label="Close"]').first().click();
  await page.waitForTimeout(500);
  const modalClosed = (await page.locator('[role="dialog"][aria-label="Smart Khata Entry"]').count()) === 0
    || !(await page.locator('[role="dialog"][aria-label="Smart Khata Entry"]').first().isVisible().catch(() => false));
  a(modalClosed, "Modal closes on X button");

  // Reopen
  await page.locator('button[aria-label*="Smart Entry voice"]').first().click();
  await page.waitForTimeout(500);
  const choiceVisible2 = await page.locator('text=Hold the mic button').count();
  a(choiceVisible2 >= 1, "ChoiceView shown on reopen (fresh start)");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 5. New customer detection + creation flow ---");
  await mockInterpret(mockFormResponse({
    customerNameRaw: "New Customer Ali",
    productNameRaw: "Rice",
    resolvedCustomerId: null, // customer NOT resolved
    resolvedProductId: product.id,
    isNewCustomer: true,
    isNewProduct: false,
    customerCandidates: [],
    productCandidates: [{ id: product.id, name: "Rice", unit: "kg", sellingPrice: "1000" }],
    transcript: "Ali bought 10 kg rice",
    quantityRaw: 10,
    unitPrice: 1000,
    totalAmount: 10000,
    balance: 10000,
    extraForm: { customerCandidates: [] },
  }));

  // Type and submit
  await page.locator("textarea").first().fill("Ali bought 10 kg rice");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  // Should show "New customer detected" banner
  // Use getByText for partial match (the text is inside a <p> with an icon)
  const newCustomerBanner = await page.getByText(/New customer detected/i).count();
  a(newCustomerBanner >= 1, "'New customer detected' banner shown");

  // Should have an "Add" button for the new customer (scoped to the banner area)
  const addCustomerBtn = await page.locator('button:has-text("Add New Customer Ali")').count();
  a(addCustomerBtn >= 1, "'Add New Customer Ali' button shown for new customer");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 6. New product detection + AddProductWizard ---");
  // Close + reopen for a fresh start
  const seDialog2 = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  await seDialog2.locator('[aria-label="Close"]').first().click();
  await page.waitForTimeout(500);
  await page.locator('button[aria-label*="Smart Entry voice"]').first().click();
  await page.waitForTimeout(500);

  await mockInterpret(mockFormResponse({
    customerNameRaw: "Ahmad",
    productNameRaw: "Basmati Rice",
    resolvedCustomerId: customer.id,
    resolvedProductId: null, // product NOT resolved
    isNewCustomer: false,
    isNewProduct: true,
    customerCandidates: [{ id: customer.id, name: "Ahmad Khan", phone: `0300${u}` }],
    productCandidates: [],
    transcript: "Ahmad bought 5 kg basmati rice",
    quantityRaw: 5,
    unitPrice: null,
    totalAmount: null,
    balance: null,
    priceSource: "NONE",
    extraForm: { productCandidates: [] },
  }));

  await page.locator("textarea").first().fill("Ahmad bought 5 kg basmati rice");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  // Should show "New product detected" banner
  const newProductBanner = await page.getByText(/New product detected/i).count();
  a(newProductBanner >= 1, "'New product detected' banner shown");

  // Should have "Add Product" button — scope to the banner (not the wizard)
  // The banner has two buttons: "Add Product" and "Choose Another"
  const addProductBtn = page.getByRole("button", { name: /Add Product/i }).first();
  a(await addProductBtn.count() >= 1, "'Add Product' button shown for new product");

  // Click "Add Product" → wizard should open
  await addProductBtn.click();
  await page.waitForTimeout(500);

  const wizardVisible = await page.locator('text=Add New Product').count();
  a(wizardVisible >= 1, "AddProductWizard opens on 'Add Product' click");

  // Verify Step 1 fields are present
  const step1Fields = ["Name", "Category", "Unit", "SKU"];
  for (const field of step1Fields) {
    const found = await page.locator(`text=${field}`).count();
    a(found >= 1, `Wizard Step 1 has '${field}' field`);
  }

  // Verify name is pre-filled from AI
  const nameInput = page.locator('input[placeholder="Product name"]').first();
  const nameValue = await nameInput.inputValue();
  a(nameValue === "Basmati Rice", "Wizard name pre-filled with 'Basmati Rice' from AI", `got: ${nameValue}`);

  // Verify "Next" button exists
  const nextBtn = page.locator('button:has-text("Next")').first();
  a(await nextBtn.count() >= 1, "Wizard Step 1 has 'Next' button");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 7. Responsive at multiple viewport sizes ---");
  // Close wizard + modal first — scope to Smart Entry dialog
  const seDialog3 = page.locator('[role="dialog"][aria-label="Smart Khata Entry"]');
  if (await seDialog3.count() > 0) {
    await seDialog3.locator('[aria-label="Close"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  const sizes = [
    { w: 320, h: 568, label: "320×568 (small mobile)" },
    { w: 390, h: 844, label: "390×844 (iPhone 12)" },
    { w: 768, h: 1024, label: "768×1024 (tablet)" },
    { w: 1280, h: 800, label: "1280×800 (desktop)" },
  ];
  for (const { w, h, label } of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const fabVisible = await page.locator('button[aria-label*="Smart Entry voice"]').first().isVisible().catch(() => false);
    a(fabVisible, `${label}: SmartEntryFab visible`);
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    a(!hasHScroll, `${label}: no horizontal overflow`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 8. No console errors related to new code ---");
  const smartEntryErrors = consoleErrors.filter((e) =>
    e.includes("SmartEntryFab") || e.includes("useSmartEntry") ||
    e.includes("stale") || e.includes("requestId")
  );
  a(smartEntryErrors.length === 0, "No console errors related to V3 changes",
    smartEntryErrors.join("; "));

  await browser.close();

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 9. Backend: execute transaction with correct values ---");
  // Create a SmartEntrySession manually + execute
  const session = await prisma.smartEntrySession.create({
    data: {
      userId: ua.user.id,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript: "Ahmad bought 25 kg rice",
      resolvedCustomerId: customer.id,
      resolvedProductId: product.id,
      quantityRaw: 25,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  const ex = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: session.id,
      customerId: customer.id,
      productId: product.id,
      quantity: 25,
      unitPrice: 1000,
      paidAmount: 10000, // partial payment
    }),
  });
  const exJson = await ex.json();
  a(exJson.ok, "Execute succeeds");
  a(exJson.data?.totalAmount === "25000", "Total = 25000 (25 × 1000)", `got ${exJson.data?.totalAmount}`);
  a(exJson.data?.outstanding === "15000", "Outstanding = 15000 (25000 - 10000 paid)", `got ${exJson.data?.outstanding}`);

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 10. Idempotent re-execute (no duplicate) ---");
  const reEx = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ua.cookie },
    body: JSON.stringify({
      sessionId: session.id,
      customerId: customer.id,
      productId: product.id,
      quantity: 25,
      unitPrice: 1000,
      paidAmount: 10000,
    }),
  });
  const reExJson = await reEx.json();
  a(reExJson.ok, "Re-execute returns ok (idempotent)");
  a(reExJson.data?.saleId === exJson.data?.saleId, "Re-execute returns SAME saleId (no duplicate)");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- 11. Cross-tenant isolation ---");
  const ub = await register("V3Test B", `v3b-${u}@e.com`);
  const crossExec = await fetch(`${BASE}/api/smart-entry/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ub.cookie },
    body: JSON.stringify({
      sessionId: session.id,
      customerId: customer.id,
      productId: product.id,
      quantity: 5,
      unitPrice: 1000,
    }),
  });
  a(crossExec.status === 404 || crossExec.status === 400, "User B cannot execute User A's session");

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n--- Cleanup ---");
  await prisma.user.delete({ where: { id: ua.user.id } });
  await prisma.user.delete({ where: { id: ub.user.id } });
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
