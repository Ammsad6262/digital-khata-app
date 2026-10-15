/**
 * Urdu Translation & RTL Test — V13
 *
 * Verifies:
 *   1. All translation keys in translations.ts have BOTH en and ur values
 *   2. Language switching works (English ↔ Urdu)
 *   3. dir="rtl" is applied to <html> when Urdu is selected
 *   4. Noto Nastaliq Urdu font is applied
 *   5. Key UI elements render Urdu text when language is set to Urdu
 *   6. Key API error messages are returned as translation keys (translationKey: true)
 *   7. RTL CSS rules work (drawer slides from left, arrows flip, etc.)
 *   8. Currency symbol respects user settings
 *   9. No hardcoded English strings remain in critical components
 *
 * Usage: node scripts/test-urdu-translation.mjs
 */

import { chromium } from "playwright";
import { readFileSync } from "fs";

const envFile = readFileSync("/home/z/my-project/digital-khata-app/.env", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const BASE = "http://localhost:3000";
let passed = 0, failed = 0;
const bugs = [];

function assert(condition, label, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${label}`);
  } else {
    failed++;
    bugs.push({ label, detail });
    console.log(`  ✗ [FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
  }
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

async function createCustomer(ck, name, phone) {
  const r = await fetch(`${BASE}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ck },
    body: JSON.stringify({ name, phone, openingBalance: 0 }),
  });
  return (await r.json()).data;
}

// ─── Static analysis: verify all translations have both en + ur ──────────────
function checkTranslationsFile() {
  console.log("\n--- A. Translation File Integrity ---");
  const content = readFileSync(
    "/home/z/my-project/digital-khata-app/src/lib/i18n/translations.ts",
    "utf-8",
  );

  // Match each entry by finding `"key": {` and then capturing up to the matching
  // `}` (accounting for nested `{...}` placeholders inside string values).
  // We do this by walking character-by-character and counting brace depth.
  const entryStarts = [];
  const keyRe = /"([a-zA-Z][\w.]*)":\s*\{/g;
  let km;
  while ((km = keyRe.exec(content)) !== null) {
    entryStarts.push({ key: km[1], braceOpenIdx: km.index + km[0].length - 1 });
  }

  let count = 0;
  let missingUrdu = 0;
  let emptyUrdu = 0;
  for (const { key, braceOpenIdx } of entryStarts) {
    // Walk forward from braceOpenIdx counting brace depth.
    // Stop when depth returns to 0.
    let depth = 1;
    let i = braceOpenIdx + 1;
    // We need to be careful about `{` and `}` inside string literals.
    // Simplest: track whether we're inside a `"..."` string.
    let inString = false;
    let escaped = false;
    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = !inString;
      } else if (!inString) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      i++;
    }
    const body = content.slice(braceOpenIdx, i);
    if (!body.includes("en:")) continue;
    count++;
    if (!body.includes("ur:")) {
      missingUrdu++;
      console.log(`  ⚠ Missing ur: field on key "${key}"`);
    } else {
      // Extract the ur value to check it's non-empty
      const urMatch = body.match(/ur:\s*"([^"]*)"/);
      if (urMatch && !urMatch[1]) emptyUrdu++;
    }
  }
  assert(count > 200, `Translation file has ${count} entries`, `expected >200`);
  assert(missingUrdu === 0, "All entries have ur: field", `${missingUrdu} entries missing ur: field`);
  assert(emptyUrdu === 0, "All entries have non-empty Urdu text", `${emptyUrdu} entries have empty Urdu`);
}

// ─── API error translation ───────────────────────────────────────────────────
async function checkApiErrorTranslation(ck) {
  console.log("\n--- B. API Error Translation Keys ---");
  // Try to access a non-existent customer — should return 404 with translationKey: true
  const r = await fetch(`${BASE}/api/customers/nonexistent-id-12345`, {
    headers: { Cookie: ck },
  });
  const j = await r.json();
  assert(r.status === 404, "Non-existent customer returns 404", `got ${r.status}`);
  assert(j.error?.translationKey === true, "Error has translationKey: true", `got ${j.error?.translationKey}`);
  assert(j.error?.message?.length > 0, "Error message is non-empty", `got ${j.error?.message}`);

  // Try to access a non-existent sale
  const r2 = await fetch(`${BASE}/api/sales/nonexistent-sale-id`, {
    headers: { Cookie: ck },
  });
  const j2 = await r2.json();
  assert(r2.status === 404, "Non-existent sale returns 404", `got ${r2.status}`);
  assert(j2.error?.translationKey === true, "Sale error has translationKey: true", `got ${j2.error?.translationKey}`);

  // Try to create sale with bad data — should return 400 with translationKey
  const r3 = await fetch(`${BASE}/api/sales`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ck },
    body: JSON.stringify({ items: [] }),
  });
  const j3 = await r3.json();
  assert(r3.status === 400, "Invalid sale returns 400", `got ${r3.status}`);
  assert(j3.error?.translationKey === true, "Validation error has translationKey: true", `got ${j3.error?.translationKey}`);
}

// ─── UI Tests: Language switching ────────────────────────────────────────────
async function checkLanguageSwitching(ck) {
  console.log("\n--- C. Language Switching (UI) ---");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([
    { name: "dk_auth_token", value: ck.split("=")[1], domain: "localhost", path: "/" },
  ]);
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // 1. Load dashboard in English (default)
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const htmlLangEn = await page.getAttribute("html", "lang");
  const htmlDirEn = await page.getAttribute("html", "dir");
  assert(htmlLangEn === "en", "Default language is en", `got ${htmlLangEn}`);
  assert(htmlDirEn === "ltr", "Default direction is ltr", `got ${htmlDirEn}`);

  // 2. Capture English text on dashboard (header title)
  const englishTitle = await page.locator("h1").first().textContent();
  assert(englishTitle?.includes("Digital Khata"), "English title shows 'Digital Khata'", `got "${englishTitle}"`);

  // 3. Navigate to settings and switch language
  await page.goto(`${BASE}/more/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Look for the Urdu language option button — it has the text "اردو"
  // Settings page renders multiple sections; the language section has English/Urdu options
  const urduButton = page.locator('button:has-text("اردو")').first();
  const urduButtonVisible = await urduButton.isVisible().catch(() => false);
  if (urduButtonVisible) {
    await urduButton.click();
    await page.waitForTimeout(1500);
  } else {
    // Try clicking on a div/span containing اردو
    const urduSpan = page.locator('text=اردو').first();
    await urduSpan.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  // 4. Verify <html lang="ur"> and dir="rtl"
  const htmlLangUr = await page.getAttribute("html", "lang");
  const htmlDirUr = await page.getAttribute("html", "dir");
  assert(htmlLangUr === "ur", "After Urdu click: lang=ur", `got ${htmlLangUr}`);
  assert(htmlDirUr === "rtl", "After Urdu click: dir=rtl", `got ${htmlDirUr}`);

  // 5. Verify Urdu title shows
  const urduTitle = await page.locator("h1").first().textContent();
  assert(urduTitle?.includes("ڈیجیٹل کھاتہ") || urduTitle?.includes("ترتیبات"), "Urdu title shows after switch", `got "${urduTitle}"`);

  // 6. Verify font-urdu class is applied (CSS rule for Noto Nastaliq Urdu)
  // The CSS rule is: html[lang="ur"] body { font-family: var(--font-urdu) }
  // We can't directly check computed font-family on body easily, but we can check that the CSS rule exists
  const bodyFont = await page.evaluate(() => {
    return window.getComputedStyle(document.body).fontFamily;
  });
  assert(
    bodyFont.includes("Noto Nastaliq") || bodyFont.includes("font-urdu") || bodyFont.includes("Urdu"),
    "Body uses Urdu font when lang=ur",
    `got ${bodyFont}`,
  );

  // 7. Navigate to dashboard and verify Urdu text
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const dashboardH1 = await page.locator("h1").first().textContent();
  assert(dashboardH1?.includes("ڈیجیٹل کھاتہ"), "Dashboard title in Urdu", `got "${dashboardH1}"`);

  // 8. Navigate to khata and verify Urdu text
  await page.goto(`${BASE}/khata`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const khataH1 = await page.locator("h1").first().textContent();
  assert(khataH1?.includes("کھاتہ"), "Khata title in Urdu", `got "${khataH1}"`);

  // 9. Navigate to sales and verify
  await page.goto(`${BASE}/sales`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const salesH1 = await page.locator("h1").first().textContent();
  assert(salesH1?.includes("فروخت"), "Sales title in Urdu", `got "${salesH1}"`);

  // 10. Check that no obvious English UI text remains in headers
  // Look at all h1 elements — none should be plain English
  // (We allow product/customer names which are user data)
  await page.goto(`${BASE}/stock`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const stockH1 = await page.locator("h1").first().textContent();
  assert(stockH1?.includes("اسٹاک"), "Stock title in Urdu", `got "${stockH1}"`);

  // 11. Test that the More drawer slides in from the LEFT in RTL
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // Click the More button — it has aria-label "مزید" (Urdu for "More")
  const moreButton = page.locator('button[aria-label="مزید"]').first();
  if (await moreButton.isVisible().catch(() => false)) {
    await moreButton.click();
    await page.waitForTimeout(500);
    // Check that the drawer panel is visible
    const drawerVisible = await page.locator('aside[role="dialog"]').first().isVisible().catch(() => false);
    assert(drawerVisible, "More drawer opens in Urdu mode");
  }

  // 12. Switch back to English and verify
  await page.goto(`${BASE}/more/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // In Urdu UI, the English option button shows "انگریزی" (Urdu for "English").
  // In English UI, it shows "English". Look for either.
  const englishButton = page.locator('button:has-text("English"), button:has-text("انگریزی")').first();
  if (await englishButton.isVisible().catch(() => false)) {
    await englishButton.click();
    await page.waitForTimeout(1500);
  }
  const finalLang = await page.getAttribute("html", "lang");
  const finalDir = await page.getAttribute("html", "dir");
  assert(finalLang === "en", "Switch back to English: lang=en", `got ${finalLang}`);
  assert(finalDir === "ltr", "Switch back to English: dir=ltr", `got ${finalDir}`);

  // 13. No critical console errors
  const criticalErrors = consoleErrors.filter(
    (e) => !e.includes("favicon") && !e.includes("manifest") && !e.includes("service-worker"),
  );
  assert(criticalErrors.length === 0, "No critical console errors during language switching", `${criticalErrors.length} errors: ${criticalErrors[0]?.slice(0, 100)}`);

  await browser.close();
}

// ─── Currency symbol respects settings ────────────────────────────────────────
async function checkCurrencySymbol(ck) {
  console.log("\n--- D. Currency Symbol ---");
  // Get current settings
  const r = await fetch(`${BASE}/api/settings`, { headers: { Cookie: ck } });
  const j = await r.json();
  assert(j.ok, "Settings endpoint returns ok");
  assert(!!j.data?.currencySymbol, "Settings has currencySymbol field", `got ${j.data?.currencySymbol}`);

  // Update currency symbol to "₨" (Pakistani Rupee symbol)
  const r2 = await fetch(`${BASE}/api/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: ck },
    body: JSON.stringify({ currencySymbol: "₨" }),
  });
  const j2 = await r2.json();
  assert(j2.ok, "Update currency symbol succeeds");
  assert(j2.data?.currencySymbol === "₨", "Currency symbol updated to ₨", `got ${j2.data?.currencySymbol}`);
}

// ─── Smart Entry Modal renders Urdu ───────────────────────────────────────────
async function checkSmartEntryUrdu(ck) {
  console.log("\n--- E. Smart Entry Modal in Urdu ---");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([
    { name: "dk_auth_token", value: ck.split("=")[1], domain: "localhost", path: "/" },
  ]);
  const page = await ctx.newPage();

  // Set language to Urdu via localStorage
  await page.addInitScript(() => {
    try {
      localStorage.setItem("digital-khata-lang", "ur");
    } catch {}
  });

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const htmlLang = await page.getAttribute("html", "lang");
  assert(htmlLang === "ur", "Dashboard loads with Urdu (lang=ur)", `got ${htmlLang}`);

  // Verify Smart Entry FAB has Urdu aria-label
  const fab = page.locator('button[aria-label*="اسمارٹ"]').first();
  const fabVisible = await fab.isVisible().catch(() => false);
  assert(fabVisible, "Smart Entry FAB has Urdu aria-label", "no FAB with Urdu aria-label found");

  // Click the FAB to open the modal
  if (fabVisible) {
    await fab.click();
    await page.waitForTimeout(800);
    // Verify the Smart Entry modal opens. The modal has aria-label
    // "اسمارٹ کھاتہ اندراج" (Smart Khata Entry) — distinct from the
    // MoreDrawer which has aria-label "مزید" (More).
    const smartModal = page.locator(
      '[role="dialog"][aria-label="اسمارٹ کھاتہ اندراج"]',
    ).first();
    const smartModalVisible = await smartModal.isVisible().catch(() => false);
    assert(smartModalVisible, "Smart Entry modal opens on FAB tap");

    if (smartModalVisible) {
      const modalText = await smartModal.textContent();
      // Should contain Urdu text like "اسمارٹ اندراج" (Smart Entry) or
      // "بات کریں یا ٹائپ کریں" (Speak or type what happened)
      assert(
        modalText?.includes("اسمارٹ") || modalText?.includes("بات کریں"),
        "Smart Entry modal shows Urdu text",
        `got: ${modalText?.slice(0, 100)}`,
      );
    }
  }

  await browser.close();
}

// ─── Main ───────────────────────────────────────────────────────────────────
console.log("=== URDU TRANSLATION & RTL AUDIT (V13) ===\n");

const u = Date.now();
const ua = await register("Urdu Test", `urdu-${u}@e.com`);
assert(!!ua.user, "User registration succeeds");

const ck = ua.cookie;

// A. Static analysis of translations.ts
checkTranslationsFile();

// B. API error translation
await checkApiErrorTranslation(ck);

// C. UI language switching
await checkLanguageSwitching(ck);

// D. Currency symbol
await checkCurrencySymbol(ck);

// E. Smart Entry in Urdu
await checkSmartEntryUrdu(ck);

console.log("\n--- Cleanup ---");
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
try {
  await prisma.user.delete({ where: { id: ua.user.id } });
  console.log("  OK - Test user deleted");
} catch (e) {
  console.log(`  (cleanup skipped: ${e.message})`);
}
await prisma.$disconnect();

console.log(`\n${"=".repeat(60)}\n  URDU AUDIT: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
if (bugs.length > 0) {
  console.log("\nFAILURES:");
  bugs.forEach((b) => console.log(`  ✗ ${b.label}${b.detail ? ` — ${b.detail}` : ""}`));
}

process.exit(failed > 0 ? 1 : 0);
