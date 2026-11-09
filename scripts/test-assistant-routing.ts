/**
 * Assistant routing regression tests (pure — no database, no AI).
 *
 * Proves the two production bugs are fixed:
 *   1. "Ahmed bought 25 kilo rice" extracts the product ("Rice"), not "the product".
 *   2. Urdu / Pashto commands are escalated to the model instead of being
 *      silently mis-parsed by the Latin-only rules.
 *
 * Usage: npx tsx scripts/test-assistant-routing.ts
 */

import { route, shouldEscalate } from "../src/lib/assistant/router";
import { detectSpeechLanguage } from "../src/lib/assistant/language";
import type { RouteAction, RouteMatch, RouterContext } from "../src/lib/assistant/types";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, label: string, detail?: string) => {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const ctx: RouterContext = {
  customers: [
    { id: "c1", name: "Ahmed" },
    { id: "c2", name: "Bilal" },
    { id: "c3", name: "Imran" },
  ],
  products: [
    { id: "p1", name: "Rice", unit: "kg", sellingPrice: "250" },
    { id: "p2", name: "Sugar", unit: "bag", sellingPrice: "5500" },
    { id: "p3", name: "Soap", unit: "box", sellingPrice: "100" },
  ],
  suppliers: [{ id: "s1", name: "Cement House" }],
  thread: {},
};

const asAction = (m: RouteMatch | null): RouteAction | null =>
  m && m.type === "action" ? m : null;

// ── 1. The screenshot bug: "bought 25 kilo rice" must find the product ──────
{
  const m = asAction(route("Ahmed bought 25 kilo rice", ctx));
  ok(!!m && m.action === "CREATE_SALE", "sale: action is CREATE_SALE", m?.action);
  ok(m?.fields.customerName === "Ahmed", "sale: customer is Ahmed", m?.fields.customerName);
  ok(m?.fields.productName === "Rice", "sale: product is Rice (not 'the product')", m?.fields.productName);
  ok(m?.fields.quantity === 25, "sale: quantity is 25", String(m?.fields.quantity));
  ok(m?.fields.unit === "kg", "sale: unit is kg", m?.fields.unit);
  ok(shouldEscalate(m, "Ahmed bought 25 kilo rice") === false, "sale: complete → no AI needed");
}

// ── 2. Payment ──────────────────────────────────────────────────────────────
{
  const m = asAction(route("Ahmed paid me 5000", ctx));
  ok(!!m && m.action === "RECORD_PAYMENT", "payment: RECORD_PAYMENT", m?.action);
  ok(m?.fields.amount === 5000, "payment: amount 5000", String(m?.fields.amount));
  ok(shouldEscalate(m, "Ahmed paid me 5000") === false, "payment: complete → no AI needed");
}

// ── 3. "sold 2 boxes soap to Bilal" (product before 'to') ───────────────────
{
  const m = asAction(route("sold 2 boxes soap to Bilal", ctx));
  ok(m?.fields.productName === "Soap", "sold: product Soap", m?.fields.productName);
  ok(m?.fields.customerName === "Bilal", "sold: customer Bilal", m?.fields.customerName);
  ok(m?.fields.quantity === 2 && m?.fields.unit === "box", "sold: 2 box", `${m?.fields.quantity} ${m?.fields.unit}`);
}

// ── 4. Stock intake ─────────────────────────────────────────────────────────
{
  const m = asAction(route("add 50 kg rice stock at 900", ctx));
  ok(m?.action === "ADD_STOCK", "stock: ADD_STOCK", m?.action);
  ok(m?.fields.productName === "Rice" && m?.fields.quantity === 50, "stock: Rice 50", `${m?.fields.productName} ${m?.fields.quantity}`);
}

// ── 5. Expense ──────────────────────────────────────────────────────────────
{
  const m = asAction(route("spent 500 on electricity", ctx));
  ok(m?.action === "CREATE_EXPENSE", "expense: CREATE_EXPENSE", m?.action);
  ok(m?.fields.amount === 500, "expense: amount 500", String(m?.fields.amount));
}

// ── 6. Purchase from a supplier at a price ─────────────────────────────────
{
  const m = asAction(route("bought 10 bags sugar from Cement House at 5500", ctx));
  ok(m?.action === "CREATE_PURCHASE", "purchase: CREATE_PURCHASE", m?.action);
  ok(m?.fields.productName === "Sugar", "purchase: product Sugar", m?.fields.productName);
  ok(m?.fields.supplierName === "Cement House", "purchase: supplier", m?.fields.supplierName);
  ok(shouldEscalate(m, "bought 10 bags sugar from Cement House at 5500") === false, "purchase: complete → no AI needed");
}

// ── 7. Incomplete sale must escalate to the model ──────────────────────────
{
  const text = "bought rice";
  const m = route(text, ctx);
  ok(shouldEscalate(m, text) === true, "incomplete sale → escalate to AI");
}

// ── 8/9. Urdu & Pashto must escalate to the model ──────────────────────────
{
  const urdu = "احمد نے 25 کلو چاول لیے";
  const pashto = "احمد ۲۵ کيلو وريجې واخيستې";
  ok(detectSpeechLanguage(urdu) === "ur", "detect: Urdu script → ur", detectSpeechLanguage(urdu));
  ok(detectSpeechLanguage(pashto) === "ps", "detect: Pashto script → ps", detectSpeechLanguage(pashto));
  ok(shouldEscalate(route(urdu, ctx), urdu) === true, "Urdu command → escalate to AI");
  ok(shouldEscalate(route(pashto, ctx), pashto) === true, "Pashto command → escalate to AI");
}

// ── 10/11. Plain queries stay deterministic (no AI cost) ───────────────────
{
  const r1 = route("who owes me money", ctx);
  ok(r1?.type === "query" && r1.query === "RECEIVABLES", "query: receivables", r1?.type === "query" ? r1.query : "");
  ok(shouldEscalate(r1, "who owes me money") === false, "query: no AI needed");

  const r2 = route("show me today's expenses", ctx);
  ok(r2?.type === "query" && r2.query === "TODAY_EXPENSES", "query: today expenses", r2?.type === "query" ? r2.query : "");
  ok(shouldEscalate(r2, "show me today's expenses") === false, "query: no AI needed (2)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
