/**
 * Verifies custom units.
 *
 * The app must not force one industry's units on every business. A shop can
 * add its own unit in Settings and then use it when creating a product, and the
 * assistant must know that unit too — per business, never shared.
 *
 * Run: npx tsx scripts/verify-units.ts
 */

import { prisma } from "@/lib/db/prisma";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { createProduct, listProductsWithStock } from "@/lib/services/products";
import { buildAIContext } from "@/lib/smart-entry/service";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

async function main() {
  const stamp = Date.now();
  console.log("\n== Setup ==");
  const userA = await prisma.user.create({
    data: { name: "Unit Test A", email: `ua_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Unit Test B", email: `ub_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    console.log("\n== Custom units in settings ==");
    await updateSettings(userA.id, { customUnits: ["tray", "sack"] });
    const settingsA = await getSettings(userA.id);
    check("a business's own units are saved", settingsA.customUnits.includes("tray") && settingsA.customUnits.includes("sack"), JSON.stringify(settingsA.customUnits));

    const settingsB = await getSettings(userB.id);
    check("another business starts with no custom units", settingsB.customUnits.length === 0, JSON.stringify(settingsB.customUnits));

    console.log("\n== Assistant context ==");
    const contextA = await buildAIContext(userA.id);
    check("the assistant is told the business's own units", contextA.units.includes("tray") && contextA.units.includes("sack"), contextA.units.join(", "));
    check("the assistant still knows the sensible defaults", contextA.units.includes("piece"), contextA.units.join(", "));

    const contextB = await buildAIContext(userB.id);
    check("another business's units never leak into the context", !contextB.units.includes("tray"), contextB.units.join(", "));

    console.log("\n== Product with a custom unit ==");
    const product = await createProduct(
      {
        name: "Custom Unit Product",
        unit: "tray",
        purchasePrice: 100,
        sellingPrice: 150,
        openingStock: 3,
        sku: `UNIT-${stamp}`,
      },
      userA.id,
    );
    check("a product can use a unit the app never shipped with", product.unit === "tray", product.unit);

    const stock = await listProductsWithStock(userA.id);
    const listed = stock.find((p) => p.id === product.id);
    check("the custom unit is shown on the stock list", listed?.unit === "tray", listed?.unit);

    const contextAfter = await buildAIContext(userA.id);
    check("the custom unit still reaches the assistant after use", contextAfter.units.includes("tray"), contextAfter.units.join(", "));

    console.log("\n== Cleanup ==");
    await prisma.stockMove.deleteMany({ where: { productId: product.id } });
    await prisma.product.deleteMany({ where: { userId: userA.id } });
    await prisma.setting.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    check("test data cleaned up", true);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
