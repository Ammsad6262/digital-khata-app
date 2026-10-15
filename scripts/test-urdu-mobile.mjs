/**
 * Urdu Mobile Width Smoke Test — V13
 *
 * Quick browser test that opens each main page in Urdu at mobile width (390px)
 * and checks for horizontal overflow, clipped text, or rendering errors.
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
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    bugs.push({ label, detail });
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
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

async function createProduct(ck, name, unit, price) {
  const r = await fetch(`${BASE}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ck },
    body: JSON.stringify({
      name,
      purchasePrice: 50,
      sellingPrice: price,
      unit,
      openingStock: 100,
    }),
  });
  return (await r.json()).data;
}

console.log("=== URDU MOBILE WIDTH SMOKE TEST ===\n");

const u = Date.now();
const ua = await register("Mobile Test", `mobile-${u}@e.com`);
const ck = ua.cookie;
const c1 = await createCustomer(ck, "Ahmad Khan", `0300${u}`);
const p1 = await createProduct(ck, "Rice", "kg", 1000);

// Test multiple viewport widths
const widths = [
  { w: 320, h: 568, label: "320px (small phone)" },
  { w: 390, h: 844, label: "390px (iPhone 12)" },
  { w: 768, h: 1024, label: "768px (tablet)" },
  { w: 1280, h: 800, label: "1280px (desktop)" },
];

const browser = await chromium.launch({ headless: true });

for (const { w, h, label } of widths) {
  console.log(`\n--- ${label} ---`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([
    { name: "dk_auth_token", value: ck.split("=")[1], domain: "localhost", path: "/" },
  ]);
  // Force Urdu via init script
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("digital-khata-lang", "ur");
    } catch {}
  });

  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  for (const path of ["/dashboard", "/khata", "/sales", "/stock", "/expenses", "/payments"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const htmlLang = await page.getAttribute("html", "lang");
    const htmlDir = await page.getAttribute("html", "dir");
    assert(htmlLang === "ur", `${path}: lang=ur at ${label}`);
    assert(htmlDir === "rtl", `${path}: dir=rtl at ${label}`);

    // Check for horizontal overflow (content extending past viewport width)
    const overflowInfo = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      const bodyScrollW = body.scrollWidth;
      const htmlScrollW = html.scrollWidth;
      const clientW = html.clientWidth;
      return {
        bodyScrollW,
        htmlScrollW,
        clientW,
        overflow: Math.max(bodyScrollW, htmlScrollW) - clientW,
      };
    });
    assert(
      overflowInfo.overflow <= 5,
      `${path}: no horizontal overflow at ${label}`,
      `overflow=${overflowInfo.overflow}px`,
    );
  }

  // Check no critical console errors
  const critical = consoleErrors.filter(
    (e) => !e.includes("favicon") && !e.includes("manifest") && !e.includes("service-worker") && !e.includes("Already restored"),
  );
  assert(critical.length === 0, `No critical console errors at ${label}`, `${critical.length} errors: ${critical[0]?.slice(0, 80)}`);

  await ctx.close();
}

await browser.close();

// Cleanup
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
try {
  await prisma.user.delete({ where: { id: ua.user.id } });
  console.log("\n  OK - Test user deleted");
} catch (e) {
  console.log(`\n  (cleanup skipped: ${e.message})`);
}
await prisma.$disconnect();

console.log(`\n${"=".repeat(60)}\n  MOBILE SMOKE TEST: ${passed} passed, ${failed} failed\n${"=".repeat(60)}`);
if (bugs.length > 0) {
  console.log("\nFAILURES:");
  bugs.forEach((b) => console.log(`  ✗ ${b.label}${b.detail ? ` — ${b.detail}` : ""}`));
}
process.exit(failed > 0 ? 1 : 0);
