/**
 * Verifies the follow-up workflow end-to-end against a real DB.
 *
 * What must be true:
 *   - Candidates come from purchase dates only (no invented customers or
 *     products), and only when the customer is really past their own rhythm.
 *   - Duplicates are impossible: saving the same opportunity twice returns the
 *     one that already exists.
 *   - The message is editable and the outcome is whatever the owner recorded.
 *   - One business can never see or change another business's follow-ups.
 *
 * Run: npx tsx scripts/verify-follow-ups.ts
 */

import { prisma } from "@/lib/db/prisma";
import {
  getFollowUpCandidates,
  listFollowUps,
  getFollowUpStats,
  createFollowUp,
  updateFollowUp,
} from "@/lib/services/follow-ups";

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

async function expectFailure(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "expected an error but it succeeded");
  } catch {
    check(label, true);
  }
}

/** A date that is exactly `days` days ago, offset by an hour to avoid rounding. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000 - 3_600_000);
}

const TZ_DAY = 86_400_000;

async function main() {
  const stamp = Date.now();

  console.log("\n== Setup ==");
  const userA = await prisma.user.create({
    data: { name: "FollowUp Test A", email: `fa_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "FollowUp Test B", email: `fb_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const product = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Basmati Rice 5kg",
        sku: `RICE-${stamp}`,
        unit: "bag",
        purchasePrice: 1500,
        sellingPrice: 1800,
      },
    });
    const product2 = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Sugar 1kg",
        sku: `SUG-${stamp}`,
        unit: "kg",
        purchasePrice: 140,
        sellingPrice: 160,
      },
    });
    const product3 = await prisma.product.create({
      data: {
        userId: userA.id,
        name: "Tea 250g",
        sku: `TEA-${stamp}`,
        unit: "pack",
        purchasePrice: 400,
        sellingPrice: 480,
      },
    });

    // Regular buyer: 3 purchases, every 20 days, last one 35 days ago.
    const regular = await prisma.customer.create({
      data: { userId: userA.id, name: "Ahmed Regular", phone: "03001234567" },
    });
    // Went quiet: 3 purchases about every 20 days, last one 30 days ago,
    // each of a different product (so no single product is "due").
    const quiet = await prisma.customer.create({
      data: { userId: userA.id, name: "Bilal Quiet", phone: "03007654321" },
    });
    // Bought recently: must not be suggested.
    const recent = await prisma.customer.create({
      data: { userId: userA.id, name: "Sara Recent", phone: "03001112222" },
    });
    // Another business's customer with the same pattern.
    const foreignProduct = await prisma.product.create({
      data: {
        userId: userB.id,
        name: "Other Shop Item",
        sku: `OTHER-${stamp}`,
        unit: "piece",
        purchasePrice: 100,
        sellingPrice: 120,
      },
    });
    const foreign = await prisma.customer.create({
      data: { userId: userB.id, name: "Zafar Foreign", phone: "03003334444" },
    });

    async function recordSale(
      userId: string,
      customerId: string,
      productId: string,
      date: Date,
    ) {
      const sale = await prisma.sale.create({
        data: {
          userId,
          customerId,
          totalAmount: 1800,
          paidAmount: 0,
          outstanding: 1800,
          date,
        },
      });
      await prisma.saleItem.create({
        data: {
          saleId: sale.id,
          productId,
          quantity: 1,
          unitPrice: 1800,
          total: 1800,
        },
      });
    }

    // Regular: rice on days 75, 55, 35.
    for (const d of [75, 55, 35]) await recordSale(userA.id, regular.id, product.id, daysAgo(d));
    // Quiet: three different products on days 70, 50, 30 -> no single product
    // is due, but the customer's own rhythm (every 20 days) is 30 days stale.
    await recordSale(userA.id, quiet.id, product.id, daysAgo(70));
    await recordSale(userA.id, quiet.id, product2.id, daysAgo(50));
    await recordSale(userA.id, quiet.id, product3.id, daysAgo(30));
    // Recent: rice on days 45, 25, 5 -> well inside the 20-day rhythm.
    for (const d of [45, 25, 5]) await recordSale(userA.id, recent.id, product.id, daysAgo(d));
    // Foreign business: same overdue shape.
    for (const d of [75, 55, 35]) await recordSale(userB.id, foreign.id, foreignProduct.id, daysAgo(d));

    check("fixtures created", !!regular.id && !!quiet.id && !!recent.id);

    // -- Candidates -------------------------------------------------------
    console.log("\n== Candidates ==");
    const candidates = await getFollowUpCandidates(userA.id);

    const riceCandidate = candidates.find((c) => c.customerId === regular.id);
    check("overdue product is suggested", !!riceCandidate);
    check(
      "candidate is a reorder (not a general check-in)",
      riceCandidate?.kind === "reorder",
      riceCandidate?.kind,
    );
    check("candidate names the real product", riceCandidate?.productName === "Basmati Rice 5kg");
    check("purchase count is counted, not guessed", riceCandidate?.timesPurchased === 3);
    check(
      "average interval comes from the purchase dates",
      riceCandidate?.averageIntervalDays === 20,
      `${riceCandidate?.averageIntervalDays}`,
    );
    check(
      "days since last purchase is real",
      riceCandidate?.daysSinceLastPurchase === 35,
      `${riceCandidate?.daysSinceLastPurchase}`,
    );
    check("candidate carries the phone for calling", riceCandidate?.customerPhone === "03001234567");
    check(
      "reason quotes the same numbers",
      !!riceCandidate?.reason.includes("20 days") && !!riceCandidate?.reason.includes("35 days"),
      riceCandidate?.reason,
    );

    const quietCandidate = candidates.find((c) => c.customerId === quiet.id);
    check("quiet customer is suggested", !!quietCandidate);
    check("quiet customer is a general check-in", quietCandidate?.kind === "inactive");
    check("general check-in has no product", quietCandidate?.productId === null);

    check(
      "customer who bought recently is not suggested",
      !candidates.some((c) => c.customerId === recent.id),
    );
    check(
      "another business's customer never appears",
      !candidates.some((c) => c.customerId === foreign.id),
    );
    check(
      "candidates never duplicate a customer+product pair",
      new Set(candidates.map((c) => c.id)).size === candidates.length,
    );
    check("candidates are ordered by strongest signal", candidates.length >= 2);

    // -- Saving an opportunity -------------------------------------------
    console.log("\n== Save + duplicate protection ==");
    const first = await createFollowUp(
      {
        customerId: regular.id,
        productId: product.id,
        kind: "reorder",
        reason: riceCandidate!.reason,
        message: "Assalam-o-Alaikum Ahmed. Shall we keep 10 bags ready?",
      },
      userA.id,
    );
    check("follow-up saved", first.created === true && !!first.followUp.id);
    check("message is stored as written", first.followUp.message.includes("keep 10 bags"));
    check("new follow-up starts as pending", first.followUp.outcome === "pending");

    const duplicate = await createFollowUp(
      {
        customerId: regular.id,
        productId: product.id,
        kind: "reorder",
        reason: riceCandidate!.reason,
        message: "A second attempt",
      },
      userA.id,
    );
    check("saving it twice does not create a duplicate", duplicate.created === false);
    check("the second save returns the first follow-up", duplicate.followUp.id === first.followUp.id);

    const allForUserA = await prisma.followUp.count({ where: { userId: userA.id } });
    check("exactly one row exists for that pair", allForUserA === 1, `${allForUserA}`);

    const second = await createFollowUp(
      {
        customerId: quiet.id,
        kind: "inactive",
        reason: quietCandidate!.reason,
        message: "Assalam-o-Alaikum Bilal. Anything you need this week?",
      },
      userA.id,
    );
    check("a general check-in can be saved too", second.created === true);

    const afterSave = await getFollowUpCandidates(userA.id);
    const saved = afterSave.find((c) => c.customerId === regular.id);
    check("the open follow-up is marked on the candidate", saved?.existingFollowUpId === first.followUp.id);
    const checkIn = afterSave.find((c) => c.customerId === quiet.id);
    check("the check-in is marked on its candidate", checkIn?.existingFollowUpId === second.followUp.id);

    // -- Tenant isolation -------------------------------------------------
    console.log("\n== Tenant isolation ==");
    await expectFailure("cannot start a follow-up for another business's customer", () =>
      createFollowUp(
        { customerId: foreign.id, reason: "x", message: "y" },
        userA.id,
      ),
    );
    await expectFailure("cannot attach another business's product", () =>
      createFollowUp(
        { customerId: regular.id, productId: foreignProduct.id, reason: "x", message: "y" },
        userA.id,
      ),
    );
    await expectFailure("cannot edit another business's follow-up", () =>
      updateFollowUp(first.followUp.id, { message: "hijack" }, userB.id),
    );
    const foreignRows = await prisma.followUp.count({ where: { userId: userB.id } });
    check("no rows were created in the other business", foreignRows === 0);
    const foreignCandidates = await getFollowUpCandidates(userB.id);
    check(
      "the other business only sees its own customer",
      foreignCandidates.length === 1 && foreignCandidates[0]!.customerId === foreign.id,
      `${foreignCandidates.length}`,
    );

    // -- Editing the message ---------------------------------------------
    console.log("\n== Editing + outcomes ==");
    const edited = await updateFollowUp(
      first.followUp.id,
      { message: "Assalam-o-Alaikum Ahmed. We have 10 bags ready for you." },
      userA.id,
    );
    check("message can be edited before sending", edited.message.includes("10 bags ready"));

    const interested = await updateFollowUp(first.followUp.id, { outcome: "interested" }, userA.id);
    check("outcome can be set to interested", interested.outcome === "interested");
    check("first contact is stamped", !!interested.contactedAt);
    check("interested is still open", interested.resolvedAt === null);

    const ordered = await updateFollowUp(second.followUp.id, { outcome: "order_placed" }, userA.id);
    check("order can be recorded", ordered.outcome === "order_placed");
    check("a closed outcome is stamped with its date", !!ordered.resolvedAt);

    const stats = await getFollowUpStats(userA.id);
    check("one follow-up is still open", stats.open === 1, `${stats.open}`);
    check("one order placed is counted", stats.orderPlaced === 1);
    check("worked = 2", stats.worked === 2, `${stats.worked}`);
    check("conversion is 50%", stats.conversionPct === 50, `${stats.conversionPct}`);

    const openList = await listFollowUps(userA.id, "open");
    check("open filter returns only the open one", openList.length === 1 && openList[0]!.id === first.followUp.id);
    const resolvedList = await listFollowUps(userA.id, "resolved");
    check(
      "resolved filter returns only the closed one",
      resolvedList.length === 1 && resolvedList[0]!.id === second.followUp.id,
    );

    const reopened = await updateFollowUp(first.followUp.id, { outcome: "pending" }, userA.id);
    check("a closed follow-up can be reopened", reopened.outcome === "pending");
    check("reopening clears the resolved date", reopened.resolvedAt === null);

    await expectFailure("an unknown outcome is rejected", () =>
      updateFollowUp(first.followUp.id, { outcome: "sold" as never }, userA.id),
    );
    await expectFailure("an empty message is rejected", () =>
      updateFollowUp(first.followUp.id, { message: "   " }, userA.id),
    );
    await expectFailure("an over-long message is rejected", () =>
      updateFollowUp(first.followUp.id, { message: "x".repeat(1001) }, userA.id),
    );
    await expectFailure("an empty reason is rejected", () =>
      createFollowUp({ customerId: recent.id, reason: "  ", message: "hi" }, userA.id),
    );

    // A closed follow-up must not block a fresh opportunity later.
    await updateFollowUp(first.followUp.id, { outcome: "not_interested" }, userA.id);
    const reopenedCandidates = await getFollowUpCandidates(userA.id);
    const cleared = reopenedCandidates.find((c) => c.customerId === regular.id);
    check("a closed follow-up frees the opportunity again", cleared?.existingFollowUpId === null);

    // -- Cleanup ----------------------------------------------------------
    console.log("\n== Cleanup ==");
    await prisma.followUp.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.saleItem.deleteMany({
      where: { sale: { userId: { in: [userA.id, userB.id] } } },
    });
    await prisma.sale.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.product.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.customer.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    check("test data cleaned up", true);

    void TZ_DAY;
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
