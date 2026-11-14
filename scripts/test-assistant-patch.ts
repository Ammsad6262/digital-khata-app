/**
 * Assistant confirm-patch regression tests (pure — no database, no AI).
 *
 * Guards the bug that made the one-tap "Create <name>" flow dead on arrival:
 * the confirm route dropped createMissing / the *Name fields from the patch.
 *
 * Usage: npx tsx scripts/test-assistant-patch.ts
 */

import { sanitizePatch, ALLOWED_PATCH_KEYS } from "../src/lib/assistant/patch";

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

// The exact keys the confirmation card relies on must be allow-listed.
for (const key of ["createMissing", "customerName", "productName", "supplierName"] as const) {
  ok(ALLOWED_PATCH_KEYS.includes(key), `allow-list includes ${key}`);
}

// A normal create patch survives intact.
const createPatch = sanitizePatch({
  createMissing: { product: true },
  productName: "  Marshmallow  ",
  quantity: 25,
  unit: "kilo",
  unitPrice: 120,
  paidAmount: 0,
  method: "cash",
});
ok(createPatch.createMissing?.product === true, "createMissing.product survives");
ok(createPatch.productName === "Marshmallow", "productName is trimmed");
ok(createPatch.quantity === 25, "numeric quantity survives");
ok(createPatch.paidAmount === 0, "a zero paidAmount survives (on credit)");
ok(createPatch.method === "cash", "payment method survives");

// Anything not on the allow-list is dropped.
const hostile = sanitizePatch({ action: "VOID_SALE", userId: "someone-else", quantity: 3 });
ok(!("action" in hostile), "action cannot be patched");
ok(!("userId" in hostile), "userId cannot be patched");
ok(hostile.quantity === 3, "allow-listed key still passes");

// createMissing is normalised to a fixed 3-boolean flag.
const weird = sanitizePatch({ createMissing: { product: true, customer: 1, evil: true } });
ok(weird.createMissing?.product === true, "boolean product stays true");
ok(weird.createMissing?.customer === false, "non-boolean customer becomes false");
ok(!("evil" in (weird.createMissing ?? {})), "unknown flag keys are dropped");

// Names must be non-empty strings, bounded in length.
const emptyName = sanitizePatch({ productName: "   " });
ok(!("productName" in emptyName), "blank productName is dropped");
const longName = sanitizePatch({ customerName: "x".repeat(500) });
ok((longName.customerName ?? "").length === 120, "long customerName is capped at 120");

// A non-object patch yields an empty patch rather than throwing.
ok(Object.keys(sanitizePatch(undefined)).length === 0, "undefined patch is empty");
ok(Object.keys(sanitizePatch("nope")).length === 0, "string patch is empty");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
