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
import { GET as customersGET } from "@/app/api/customers/route";
import { BILLING_ENABLED } from "@/lib/services/subscription";

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

    // When billing is not configured, Part 20 says core and AI use must not be
    // paywalled. The gate is therefore bypassed intentionally; the test then
    // proves the request is NOT rejected by the entitlement gate.
    const gateCheck = (label: string, status: number) => {
      if (BILLING_ENABLED) {
        check(`${label} → 403`, status === 403, `got ${status}`);
      } else {
        check(`${label} passes the gate while billing is off`, status !== 403, `got ${status}`);
      }
    };

    const interpretRes = await interpretPOST(
      makeReq("/api/smart-entry/interpret", expired.token, body),
    );
    gateCheck("interpret", interpretRes.status);

    const executeRes = await executePOST(
      makeReq("/api/smart-entry/execute", expired.token, { sessionId: "x" }),
    );
    gateCheck("execute", executeRes.status);

    const cancelRes = await cancelPOST(
      makeReq("/api/smart-entry/cancel", expired.token, { sessionId: "x" }),
    );
    gateCheck("cancel", cancelRes.status);

    const unauthorized = await interpretPOST(
      makeReq("/api/smart-entry/interpret", "not-a-token", body),
    );
    check("invalid token → 401", unauthorized.status === 401, `got ${unauthorized.status}`);

    // Core bookkeeping is not part of the AI entitlement. An expired trial can
    // still read its own customer list, whether or not billing is configured.
    const coreRes = await customersGET(makeGet("/api/customers", expired.token));
    check(
      "core customer list is not paywalled for an expired account",
      coreRes.status === 200,
      `got ${coreRes.status}`,
    );

    const growthRes = await growthGET(makeGet("/api/growth", expired.token));
    gateCheck("growth plan", growthRes.status);

    const growthSummaryRes = await growthSummaryPOST(
      makeReq("/api/growth/summary", expired.token, {}),
    );
    gateCheck("growth AI summary", growthSummaryRes.status);

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
