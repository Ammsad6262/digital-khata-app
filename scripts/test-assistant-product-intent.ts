/**
 * Product-intent tests (pure — no database, no AI).
 *
 * The owner's rule: naming a product in a SALE ("Khalid bought marshmallow")
 * must never create the product — the sale stays a sale and the card reports
 * that the product is missing. Only an explicit "add product <name>" opens the
 * full product form. These tests pin that distinction in the router, and the
 * no-auto-create rule is enforced again in actions.resolveOrCreateProduct.
 *
 * Usage: npx tsx scripts/test-assistant-product-intent.ts
 */

import { route } from "../src/lib/assistant/router";
import type { RouteAction, RouterContext } from "../src/lib/assistant/types";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, label: string, detail?: string) => {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
  }
};

const ctx: RouterContext = {
  customers: [{ id: "c1", name: "Khalid" }],
  products: [],
  suppliers: [],
  thread: {},
};

const action = (text: string): RouteAction | null => {
  const match = route(text, ctx);
  return match && match.type === "action" ? match : null;
};

// 1. A sale that names a product the shop does not have stays a SALE.
{
  const m = action("khalid bought marshmallow");
  ok(m?.action === "CREATE_SALE", "unknown product in a sale stays CREATE_SALE", m?.action);
  ok(
    m?.fields.productName?.toLowerCase() === "marshmallow",
    "sale keeps the spoken product name (for the warning)",
    m?.fields.productName,
  );
  ok(
    (m?.missing ?? []).includes("product"),
    "sale marks the product as missing so the card warns",
    JSON.stringify(m?.missing),
  );
}

// 2. Explicit product creation is a different action with the name captured.
{
  const m = action("add a product marshmallow");
  ok(m?.action === "CREATE_PRODUCT", "explicit add-product is CREATE_PRODUCT", m?.action);
  ok(
    (m?.fields.name ?? m?.fields.productName)?.toLowerCase() === "marshmallow",
    "product name is captured",
    m?.fields.name,
  );
  ok(
    (m?.missing ?? []).includes("unitPrice"),
    "product form asks for the price when it was not spoken",
    JSON.stringify(m?.missing),
  );
}

// 3. Prices and units spoken for a new product are captured.
{
  const m = action("add product marshmallow 200 per kg");
  ok(m?.action === "CREATE_PRODUCT", "priced add-product is CREATE_PRODUCT", m?.action);
  ok(m?.fields.sellingPrice === 200, "selling price captured", String(m?.fields.sellingPrice));
  ok(m?.fields.unit === "kg", "unit captured", m?.fields.unit);
}

// 4. "create new product" also routes to CREATE_PRODUCT.
{
  const m = action("create new product marshmallow");
  ok(m?.action === "CREATE_PRODUCT", "create-new-product routes correctly", m?.action);
}

// 5. A sale command must never be turned into product creation.
{
  const m = action("khalid bought marshmallow");
  ok(m?.action !== "CREATE_PRODUCT", "sale is never misread as product creation", m?.action);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
