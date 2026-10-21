/**
 * Verifies the customer khata statement that is sent on WhatsApp.
 *
 * The statement must say exactly what the customer page says — same balance,
 * same entries, same totals — because the owner will send it without checking.
 *
 * Run: npx tsx scripts/verify-statement.ts
 */

import { buildCustomerStatement } from "@/lib/utils/statement";
import { tServer } from "@/lib/i18n/server";
import type { CustomerTransaction } from "@/lib/services/customers";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string | null) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
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

function tx(
  type: CustomerTransaction["type"],
  amount: string,
  daysAgo: number,
  id: string,
): CustomerTransaction {
  return {
    id,
    type,
    date: new Date(Date.now() - daysAgo * 86_400_000),
    amount,
    direction: type === "payment" ? "credit" : "debit",
    description: type,
    refId: `ref_${id}`,
    refType: type,
    runningBalance: "0",
  };
}

function main() {
  const customer = {
    name: "Ahmed Khan",
    balance: "29050",
    totalPurchases: "120000",
    totalPayments: "90950",
  };

  const transactions: CustomerTransaction[] = [
    tx("sale", "45000", 40, "s6"),
    tx("payment", "20000", 32, "p5"),
    tx("sale", "30000", 21, "s4"),
    tx("payment", "15000", 14, "p3"),
    tx("sale", "20000", 7, "s2"),
    tx("payment", "55950", 3, "p1"),
    tx("sale", "10000", 1, "s1"),
  ];

  console.log("\n── Statement content ──");
  const text = buildCustomerStatement(customer, transactions, en(), "Rs.", {
    businessName: "Khan Traders",
  });

  check("greets the customer by name", text.includes("Assalam-o-Alaikum Ahmed Khan."));
  check("names the business", text.includes("Khan Traders"));
  check("shows the exact balance owed", text.includes("You owe: Rs. 29,050.00"), text);
  check("shows total purchases", text.includes("Total purchases: Rs. 120,000.00"));
  check("shows total paid", text.includes("Total paid: Rs. 90,950.00"));
  check("closes politely", text.includes("Jazak Allah."));

  console.log("\n── Recent entries ──");
  const entryLines = text.split("\n").filter((l) => l.startsWith("•"));
  check("lists at most five entries", entryLines.length === 5, String(entryLines.length));
  check("newest entry comes first", entryLines[0]?.includes("Purchase") === true && entryLines[0]?.includes("10,000.00") === true, entryLines[0]);
  check("older entries are summarised", text.includes("…and 2 earlier entries."), text);
  check("payment rows are labelled payments", entryLines.some((l) => l.includes("Payment") && l.includes("55,950.00")));

  console.log("\n── Balance states ──");
  const advance = buildCustomerStatement(
    { name: "Bilal", balance: "-5000" },
    [],
    en(),
    "Rs.",
  );
  check("negative balance is shown as an advance", advance.includes("Advance with us: Rs. 5,000.00"), advance);
  check("an advance is never called a debt", !advance.toLowerCase().includes("you owe"));

  const settled = buildCustomerStatement({ name: "Bilal", balance: "0" }, [], en(), "Rs.");
  check("zero balance is called settled", settled.includes("Your account is settled."), settled);

  console.log("\n── Honesty rules ──");
  check("no invented amount appears", !text.includes("1,234.00"));
  check("the word profit is never used", !/profit|earning|income/i.test(text));
  check("nothing claims a payment was received automatically", !/we have received/i.test(text));

  console.log("\n── Urdu ──");
  const urdu = buildCustomerStatement(customer, transactions, ur(), "روپے");
  check("Urdu greeting is used", urdu.includes("اسلام علیکم"), urdu.slice(0, 80));
  check("Urdu balance label is used", urdu.includes("آپ پر باقی"), urdu.slice(0, 200));
  check("the amount is still exact in Urdu", urdu.includes("29,050.00"));

  console.log(`\n${"═".repeat(50)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}

main();
