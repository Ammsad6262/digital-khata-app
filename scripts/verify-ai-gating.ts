/**
 * Verifies that AI endpoints are gated server-side by subscription status.
 * Run: npx tsx scripts/verify-ai-gating.ts
 *
 * Proves that an expired account is rejected with 403 BEFORE any AI work
 * happens, while an active trial passes the gate.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { registerUser, AUTH_COOKIE_NAME } from "@/lib/services/auth";
import { POST as interpretPOST } from "@/app/api/smart-entry/interpret/route";
import { POST as executePOST } from "@/app/api/smart-entry/execute/route";
import { POST as cancelPOST } from "@/app/api/smart-entry/cancel/route";
import { GET as growthGET } from "@/app/api/growth/route";
import { POST as growthSummaryPOST } from "@/app/api/growth/summary/route";

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

function makeReq(path: string, token: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `${AUTH_COOKIE_NAME}=${token}`,
    },
    body: JSON.stringify(body),
  });
}

function makeGet(path: string, token: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "GET",
    headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` },
  });
}

async function main() {
  const stamp = Date.now();
  console.log("\n── Setup ──");
  const expired = await registerUser({
    name: "Expired AI",
    email: `exp_${stamp}@test.local`,
    password: "secret123",
  });
  const active = await registerUser({
    name: "Active AI",
    email: `act_${stamp}@test.local`,
    password: "secret123",
  });

  try {
    // Expire the first account's trial.
    await prisma.userSubscription.update({
      where: { userId: expired.user.id },
      data: { trialExpiresAt: new Date(Date.now() - 86_400_000) },
    });

    console.log("\n── Expired account ──");
    const body = { type: "text", text: "sold 2 boxes to Ahmed for 500" };

    const interpretRes = await interpretPOST(
      makeReq("/api/smart-entry/interpret", expired.token, body),
    );
    check("interpret → 403", interpretRes.status === 403, `got ${interpretRes.status}`);

    const executeRes = await executePOST(
      makeReq("/api/smart-entry/execute", expired.token, { sessionId: "x" }),
    );
    check("execute → 403", executeRes.status === 403, `got ${executeRes.status}`);

    const cancelRes = await cancelPOST(
      makeReq("/api/smart-entry/cancel", expired.token, { sessionId: "x" }),
    );
    check("cancel → 403", cancelRes.status === 403, `got ${cancelRes.status}`);

    const unauthorized = await interpretPOST(
      makeReq("/api/smart-entry/interpret", "not-a-token", body),
    );
    check("invalid token → 401", unauthorized.status === 401, `got ${unauthorized.status}`);

    const growthRes = await growthGET(makeGet("/api/growth", expired.token));
    check("growth plan → 403", growthRes.status === 403, `got ${growthRes.status}`);

    const growthSummaryRes = await growthSummaryPOST(
      makeReq("/api/growth/summary", expired.token, {}),
    );
    check("growth AI summary → 403", growthSummaryRes.status === 403, `got ${growthSummaryRes.status}`);

    console.log("\n── Active trial ──");
    // Empty body: the gate must pass and validation must reject the payload.
    // If gating were broken this would attempt an AI call / return 403.
    const activeRes = await interpretPOST(
      makeReq("/api/smart-entry/interpret", active.token, {}),
    );
    check(
      "active account passes the gate (400 validation, not 403)",
      activeRes.status === 400,
      `got ${activeRes.status}`,
    );

    const activeGrowthRes = await growthGET(makeGet("/api/growth", active.token));
    check("active account can read the growth plan", activeGrowthRes.status === 200, `got ${activeGrowthRes.status}`);
  } finally {
    console.log("\n── Cleanup ──");
    await prisma.user.deleteMany({
      where: { id: { in: [expired.user.id, active.user.id] } },
    });
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
