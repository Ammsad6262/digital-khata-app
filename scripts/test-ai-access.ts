/**
 * AI entitlement tests (pure — no database).
 *
 * AI is a premium feature. The one-time REGULAR licence (Rs 10,000) must NOT
 * reach any AI route; the free trial and PREMIUM/OWNER/AFFILIATE do.
 *
 * Usage: npx tsx scripts/test-ai-access.ts
 */

import {
  aiAllowed,
  computeEntitlement,
  type SubscriptionSnapshot,
} from "../src/lib/services/entitlement";

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

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-01-01T00:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const ahead = (d: number) => new Date(now.getTime() + d * DAY);

const base: SubscriptionSnapshot = {
  coreActivatedAt: null,
  coreExpiresAt: null,
  coreRevokedAt: null,
  premiumStartedAt: null,
  premiumExpiresAt: null,
  premiumRevokedAt: null,
  affiliateGrantedAt: null,
  affiliateRevokedAt: null,
  ownerGrantedAt: null,
  ownerRevokedAt: null,
  accessRevokedAt: null,
  accessRevokedReason: null,
};

const ent = (over: Partial<NonNullable<SubscriptionSnapshot>>) =>
  computeEntitlement("u1", { ...base, ...over }, now);

{
  const e = computeEntitlement("u1", null, now);
  ok(e.category === "UNACTIVATED" && !aiAllowed(e), "no subscription => no AI", e.category);
}

{
  // The Rs 10,000 one-time licence: permanent core, no premium.
  const e = ent({ coreActivatedAt: ago(30), coreExpiresAt: null });
  ok(e.category === "REGULAR" && e.core.active, "paid core is REGULAR", e.category);
  ok(!aiAllowed(e), "REGULAR (Rs 10,000) cannot use AI");
}

{
  const e = ent({ coreActivatedAt: ago(1), coreExpiresAt: ahead(13) });
  ok(e.category === "TRIAL" && aiAllowed(e), "free trial can use AI", e.category);
}

{
  const e = ent({
    coreActivatedAt: ago(30),
    coreExpiresAt: null,
    premiumStartedAt: ago(1),
    premiumExpiresAt: ahead(29),
  });
  ok(e.category === "PREMIUM" && aiAllowed(e), "PREMIUM can use AI", e.category);
}

{
  const e = ent({ coreActivatedAt: ago(30), coreExpiresAt: null, ownerGrantedAt: ago(1) });
  ok(e.category === "OWNER" && aiAllowed(e), "OWNER can use AI", e.category);
}

{
  const e = ent({ coreActivatedAt: ago(30), coreExpiresAt: null, affiliateGrantedAt: ago(1) });
  ok(e.category === "AFFILIATE" && aiAllowed(e), "AFFILIATE can use AI", e.category);
}

{
  // Premium lapsed back to REGULAR: AI must switch off immediately.
  const e = ent({
    coreActivatedAt: ago(60),
    coreExpiresAt: null,
    premiumStartedAt: ago(60),
    premiumExpiresAt: ago(1),
  });
  ok(e.category === "REGULAR" && !aiAllowed(e), "expired premium => no AI", e.category);
}

{
  const e = ent({
    coreActivatedAt: ago(30),
    coreExpiresAt: null,
    accessRevokedAt: ago(1),
  });
  ok(!aiAllowed(e), "revoked access => no AI", e.category);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

export {};