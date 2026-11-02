/**
 * Proves the assistant's three tables really persist to Postgres — not only the
 * in-memory fallback.
 *
 * It writes through the SAME modules the app uses, then reads the rows back
 * through a brand-new Prisma client. If the data came from module memory, the
 * fresh client would not see it.
 *
 * Run: npx tsx scripts/verify-ai-persistence.ts
 */

import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runWithRotation, _resetMemoryUsage } from "@/lib/ai/model-registry";
import { saveThread, loadThread, _resetThreadCache } from "@/lib/assistant/context";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1;
    console.log(`  PASS ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

async function freshRead<T>(fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient();
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

async function main(): Promise<void> {
  const tag = "persist-check";
  process.env.GEMINI_MODEL_1 = `${tag}-a`;
  process.env.GEMINI_MODEL_2 = `${tag}-b`;
  process.env.GEMINI_MODEL_3 = `${tag}-c`;

  // ── AIUsageDaily ──────────────────────────────────────────────────────
  _resetMemoryUsage();
  await prisma.aIUsageDaily.deleteMany({ where: { model: { startsWith: `${tag}-` } } });
  await runWithRotation({ operation: async () => 42 });

  const usage = await freshRead((c) =>
    c.aIUsageDaily.findMany({ where: { model: { startsWith: `${tag}-` } } }),
  );
  check(
    "AIUsageDaily is written to the database",
    usage.some((row) => row.attempts >= 1 && row.successes >= 1),
    JSON.stringify(usage.map((r) => ({ model: r.model, attempts: r.attempts, successes: r.successes }))),
  );

  // ── AssistantThread + AssistantAction ─────────────────────────────────
  const user = await prisma.user.create({
    data: {
      name: "Persistence Check",
      email: `${tag}-${Date.now()}@example.com`,
      passwordHash: "not-a-real-hash",
    },
  });

  try {
    _resetThreadCache();
    await saveThread(user.id, { lastCustomerId: "cust-persist-1" });
    // Bypass the in-memory mirror entirely — read with a fresh client.
    const thread = await freshRead((c) =>
      c.assistantThread.findUnique({ where: { userId: user.id } }),
    );
    check(
      "AssistantThread is written to the database",
      !!thread && (thread.context as Record<string, unknown>).lastCustomerId === "cust-persist-1",
      JSON.stringify(thread?.context ?? null),
    );

    // A fresh module cache (simulating a different serverless instance) must
    // still see the thread — proving it came from the database.
    _resetThreadCache();
    const reloaded = await loadThread(user.id);
    check(
      "AssistantThread survives a cold cache (read back from DB)",
      reloaded.lastCustomerId === "cust-persist-1",
      JSON.stringify(reloaded),
    );

    // AssistantAction has no in-memory fallback; verify the exact shape the
    // service writes round-trips through the database.
    const action = await prisma.assistantAction.create({
      data: {
        userId: user.id,
        idempotencyKey: `${tag}-key`,
        kind: "CREATE_SALE",
        status: "PENDING",
        payload: { customerId: "cust-persist-1" },
      },
    });
    const actionRow = await freshRead((c) =>
      c.assistantAction.findUnique({ where: { id: action.id } }),
    );
    check(
      "AssistantAction is written to the database",
      !!actionRow && actionRow.kind === "CREATE_SALE" && actionRow.status === "PENDING",
      JSON.stringify(actionRow ? { kind: actionRow.kind, status: actionRow.status } : null),
    );
    check(
      "AssistantAction idempotency key is unique per user",
      await prisma.assistantAction
        .create({
          data: {
            userId: user.id,
            idempotencyKey: `${tag}-key`,
            kind: "CREATE_SALE",
            status: "PENDING",
            payload: {},
          },
        })
        .then(() => false)
        .catch(() => true),
    );
  } finally {
    await prisma.assistantThread.deleteMany({ where: { userId: user.id } });
    await prisma.assistantAction.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }

  await prisma.aIUsageDaily.deleteMany({ where: { model: { startsWith: `${tag}-` } } });

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
