/**
 * Verifies the sale receipt that is sent on WhatsApp.
 *
 * The receipt must say exactly what the sale detail screen says — same items,
 * same totals, same balance — because the owner will send it without checking.
 * It must never word an overpayment as a debt, and it must never mention
 * profit.
 *
 * Run: npx tsx scripts/verify-receipt.ts
 */

import { buildSaleReceipt } from "@/lib/utils/receipt";
import { tServer } from "@/lib/i18n/server";
import type { SaleWithItems } from "@/lib/services/sales";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string | null) {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

function en() {
  return {
    t: (key: Parameters<typeof tServer>[0]) => tServer(key),
    tParams: (key: Parameters<typeof tServer>[0], params: Record<string, string | number>) =>
      tServer(key, params),
  };
}

function ur() {
  return {
    t: (key: Parameters<typeof tServer>[0]) => tServer(key, undefined, "ur"),
    tParams: (key: Parameters<typeof tServer>[0], params: Record<string, string | number>) =>
      tServer(key, params, "ur"),
  };
}

function sale(overrides: Partial<SaleWithItems> = {}): SaleWithItems {
  const date = new Date("2026-10-20T10:00:00Z");
  return {
    id: "sale_1",
    customerId: "cust_1",
    customerName: "Ahmed Khan",
    customerPhone: "03001234567",
    totalAmount: "4500",
    discountAmount: "0",
    paidAmount: "2000",
    outstanding: "2500",
    notes: null,
    date,
    dueDate: null,
    isOverdue: false,
    voidedAt: null,
    createdAt: date,
    updatedAt: date,
    items: [
      {
        id: "i1",
        productId: "p1",
        productName: "Basmati Rice 5kg",
        productUnit: "bag",
        quantity: "2",
        unitPrice: "1500",
        total: "3000",
      },
      {
        id: "i2",
        productId: "p2",
        productName: "Sugar 1kg",
        productUnit: "kg",
        quantity: "10",
        unitPrice: "150",
        total: "1500",
      },
    ],
    ...overrides,
  };
}

function main() {
  console.log("\n== Receipt content ==");
  const text = buildSaleReceipt(sale(), en(), "Rs.", { businessName: "Khan Traders" });

  check("greets the customer by name", text.includes("Ahmed Khan"));
  check("shows the business name", text.includes("Khan Traders"));
  check("shows the sale date", text.includes("2026") || text.includes("Oct"));
  check("numbers the first item", text.includes("1. Basmati Rice 5kg"));
  check("shows quantity and unit", text.includes("2 bag"));
  check("shows the unit price", text.includes("Rs. 1,500"));
  check("shows the line total", text.includes("Rs. 3,000"));
  check("numbers the second item", text.includes("2. Sugar 1kg"));
  check("shows the second line total", text.includes("Rs. 1,500"));
  check("shows the saved total", text.includes("Total: Rs. 4,500"));
  check("shows what was paid", text.includes("Paid: Rs. 2,000"));
  check("shows what is still owed", text.includes("Still to pay: Rs. 2,500"));
  check("closes politely", text.includes("Jazak Allah"));
  check("never mentions profit", !/profit|margin|منافع/i.test(text));
  check("does not claim the message was sent", !/sent|delivered/i.test(text));

  console.log("\n== Paid in full ==");
  const paid = buildSaleReceipt(
    sale({ paidAmount: "4500", outstanding: "0" }),
    en(),
    "Rs.",
  );
  check("says the sale is paid in full", paid.includes("Paid in full."));
  check("does not show an outstanding line", !paid.includes("Still to pay"));
  check("does not show an extra-received line", !paid.includes("Extra received"));

  console.log("\n== Overpayment ==");
  const over = buildSaleReceipt(
    sale({ paidAmount: "5000", outstanding: "0" }),
    en(),
    "Rs.",
  );
  check("shows the extra money received", over.includes("Extra received: Rs. 500"));
  check("does not call the customer a debtor", !over.includes("Still to pay"));

  console.log("\n== Notes ==");
  const withNotes = buildSaleReceipt(
    sale({ notes: "Delivered to the shop on Friday." }),
    en(),
    "Rs.",
  );
  check("includes the owner's note", withNotes.includes("Delivered to the shop on Friday."));

  console.log("\n== Urdu ==");
  const urdu = buildSaleReceipt(sale(), ur(), "Rs.", { businessName: "Khan Traders" });
  check("Urdu receipt keeps the exact amounts", urdu.includes("Rs. 4,500") && urdu.includes("Rs. 2,500"));
  check("Urdu receipt uses Urdu wording", /ادائیگی|بقایا|کل/.test(urdu));
  check("Urdu receipt never mentions profit", !/منافع/.test(urdu));

  console.log("\n== Empty business name ==");
  const noBusiness = buildSaleReceipt(sale(), en(), "Rs.");
  check("falls back to a plain title", noBusiness.includes("Sale receipt"));
  check("does not leave an empty dash", !noBusiness.includes("— \n"));

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main();
