/**
 * Verifies the Reminders module end-to-end against a real DB.
 * Run: npx tsx scripts/verify-reminders.ts
 *
 * Creates two throw-away businesses, exercises the real service functions,
 * and cleans up. Does NOT touch existing data.
 */

import { prisma } from "@/lib/db/prisma";
import { startOfTodayInTz } from "@/lib/utils/date";
import {
  createReminder,
  listReminders,
  getReminder,
  getReminderCounts,
  updateReminder,
  setReminderCompleted,
  deleteReminder,
} from "@/lib/services/reminders";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
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

const TZ = "Asia/Karachi";

async function main() {
  const stamp = Date.now();
  const todayStart = startOfTodayInTz(TZ);
  const yesterday = new Date(todayStart.getTime() - 60 * 60 * 1000); // 1h before midnight
  const todayNoon = new Date(todayStart.getTime() + 12 * 60 * 60 * 1000);
  const tomorrow = new Date(todayStart.getTime() + 25 * 60 * 60 * 1000);
  const fiveDays = new Date(todayStart.getTime() + 5 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);

  console.log("\n── Setup ──");
  const userA = await prisma.user.create({
    data: { name: "Reminder Test A", email: `ra_${stamp}@test.local`, passwordHash: "x" },
  });
  const userB = await prisma.user.create({
    data: { name: "Reminder Test B", email: `rb_${stamp}@test.local`, passwordHash: "x" },
  });

  try {
    const customer = await prisma.customer.create({
      data: { userId: userA.id, name: "Ahmed", openingBalance: 5000 },
    });
    const otherCustomer = await prisma.customer.create({
      data: { userId: userB.id, name: "Bilal", openingBalance: 0 },
    });

    // ── Test 1: create + filters + counts ──
    console.log("\n── Test 1: create, filters, counts ──");
    const overdue = await createReminder(
      {
        title: "Collect Rs. 5000 from Ahmed",
        type: "payment_collection",
        dueAt: yesterday,
        priority: "high",
        customerId: customer.id,
      },
      userA.id,
    );
    const today = await createReminder(
      { title: "Call supplier", type: "supplier_payment", dueAt: todayNoon, priority: "normal" },
      userA.id,
    );
    const upcoming = await createReminder(
      {
        title: "Follow up on delivery",
        type: "customer_followup",
        dueAt: tomorrow,
        priority: "low",
        customerId: customer.id,
      },
      userA.id,
    );

    check("overdue reminder created", !!overdue.id && overdue.completedAt === null);
    check("today reminder created", !!today.id);
    check("upcoming reminder created", !!upcoming.id);

    const overdueList = await listReminders("overdue", userA.id, TZ);
    check("overdue filter returns exactly 1", overdueList.length === 1, `${overdueList.length}`);
    check("overdue filter returns the right one", overdueList[0]?.id === overdue.id);

    const todayList = await listReminders("today", userA.id, TZ);
    check("today filter returns exactly 1", todayList.length === 1, `${todayList.length}`);

    const upcomingList = await listReminders("upcoming", userA.id, TZ);
    check("upcoming filter returns exactly 1", upcomingList.length === 1, `${upcomingList.length}`);

    const counts = await getReminderCounts(userA.id, TZ);
    check(
      "counts = 1 overdue / 1 today / 1 upcoming / 0 completed",
      counts.overdue === 1 && counts.today === 1 && counts.upcoming === 1 && counts.completed === 0,
      JSON.stringify(counts),
    );

    // ── Test 2: nextFollowUpAt is derived from the earliest open reminder ──
    console.log("\n── Test 2: linked nextFollowUpAt ──");
    const custAfterCreate = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    check(
      "customer.nextFollowUpAt = earliest open reminder",
      custAfterCreate.nextFollowUpAt?.getTime() === yesterday.getTime(),
      String(custAfterCreate.nextFollowUpAt),
    );

    // ── Test 3: complete / reopen ──
    console.log("\n── Test 3: complete and reopen ──");
    await setReminderCompleted(overdue.id, true, userA.id);
    const afterComplete = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    check(
      "completing earliest reminder moves nextFollowUpAt to the next one",
      afterComplete.nextFollowUpAt?.getTime() === tomorrow.getTime(),
      String(afterComplete.nextFollowUpAt),
    );
    const countsAfter = await getReminderCounts(userA.id, TZ);
    check("completed count = 1, overdue count = 0", countsAfter.completed === 1 && countsAfter.overdue === 0);

    await setReminderCompleted(overdue.id, false, userA.id);
    const afterReopen = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    check(
      "reopening restores the earliest nextFollowUpAt",
      afterReopen.nextFollowUpAt?.getTime() === yesterday.getTime(),
      String(afterReopen.nextFollowUpAt),
    );

    // ── Test 4: editing the due date resyncs ──
    console.log("\n── Test 4: edit due date ──");
    await updateReminder(upcoming.id, { dueAt: fiveDays }, userA.id);
    const afterEdit = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    check(
      "moving the later reminder keeps the earliest nextFollowUpAt",
      afterEdit.nextFollowUpAt?.getTime() === yesterday.getTime(),
      String(afterEdit.nextFollowUpAt),
    );

    // ── Test 5: unlink recomputes ──
    console.log("\n── Test 5: unlink ──");
    await updateReminder(upcoming.id, { customerId: null }, userA.id);
    const afterUnlink = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    check(
      "unlinking the later reminder leaves the earliest intact",
      afterUnlink.nextFollowUpAt?.getTime() === yesterday.getTime(),
      String(afterUnlink.nextFollowUpAt),
    );

    // ── Test 6: delete clears nextFollowUpAt ──
    console.log("\n── Test 6: delete ──");
    await deleteReminder(overdue.id, userA.id);
    const afterDelete = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    check(
      "deleting the last open reminder clears nextFollowUpAt",
      afterDelete.nextFollowUpAt === null,
      String(afterDelete.nextFollowUpAt),
    );
    await expectFailure("deleted reminder is gone", () => getReminder(overdue.id, userA.id));

    // ── Test 7: tenant isolation ──
    console.log("\n── Test 7: tenant isolation ──");
    await expectFailure("business B cannot read A's reminder", () => getReminder(today.id, userB.id));
    await expectFailure("business B cannot edit A's reminder", () =>
      updateReminder(today.id, { title: "hacked" }, userB.id),
    );
    await expectFailure("business B cannot complete A's reminder", () =>
      setReminderCompleted(today.id, true, userB.id),
    );
    await expectFailure("business B cannot delete A's reminder", () =>
      deleteReminder(today.id, userB.id),
    );
    await expectFailure("business B cannot link a reminder to A's customer", () =>
      createReminder(
        { title: "leak", dueAt: tomorrow, customerId: customer.id },
        userB.id,
      ),
    );

    const bCounts = await getReminderCounts(userB.id, TZ);
    check(
      "B's counts do not include A's reminders",
      bCounts.overdue === 0 && bCounts.today === 0 && bCounts.upcoming === 0 && bCounts.completed === 0,
      JSON.stringify(bCounts),
    );
    const bList = await listReminders("all", userB.id, TZ);
    check("B's list is empty", bList.length === 0, `${bList.length}`);

    // B's own customer untouched by A's activity
    const otherAfter = await prisma.customer.findUniqueOrThrow({ where: { id: otherCustomer.id } });
    check("unrelated business's customer is untouched", otherAfter.nextFollowUpAt === null);
  } finally {
    console.log("\n── Cleanup ──");
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    console.log("  cleaned up test users");
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}\n`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("Verification crashed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
