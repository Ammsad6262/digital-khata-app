/**
 * Commercial licensing — integration tests.
 *
 * Runs against the REAL Prisma client and the isolated `khata_licensing`
 * database. It creates throwaway users/codes and deletes them at the end.
 *
 * Safety: the script refuses to run unless DATABASE_URL points at
 * `khata_licensing`. It never touches the production database.
 *
 * Run: npx tsx scripts/test-licensing.ts
 */

import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isAdminRequest } from "@/lib/auth/admin";
import {
  MAX_AFFILIATE_CODES,
  MAX_OWNERS,
  generateLicenseCodes,
  getEntitlement,
  getLicensingOverview,
  grantOwner,
  hasCoreAccess,
  hasPremiumAccess,
  listLicenseCodes,
  redeemLicenseCode,
  restoreAccess,
  revokeAccess,
  revokeAffiliate,
  revokeCore,
  revokeLicenseCode,
  revokeOwner,
  revokePremium,
  type LicenseKind,
} from "@/lib/services/entitlement";
import {
  createTrial,
  generateCodes,
  getRedemptionHistory,
} from "@/lib/services/subscription";

const DAY = 24 * 60 * 60 * 1000;
const RUN = `licensing-test-${Date.now()}`;
const TEST_DOMAIN = "@licensing.test";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean | undefined, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function one<T>(items: T[]): T {
  const item = items[0];
  if (!item) throw new Error("expected at least one item");
  return item;
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function expectKey(
  label: string,
  fn: () => Promise<unknown>,
  key: string,
) {
  try {
    await fn();
    check(label, false, "no error thrown");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(label, message.includes(key), `got: ${message}`);
  }
}

let userSeq = 0;
async function makeUser(tag: string) {
  userSeq++;
  return prisma.user.create({
    data: {
      name: `Licensing Test ${tag} ${userSeq}`,
      email: `${RUN}-${userSeq}${TEST_DOMAIN}`,
      passwordHash: "not-used-in-tests",
    },
  });
}

function gen(kind: LicenseKind, count = 1, expiresAt: Date | null = null) {
  return generateLicenseCodes({
    kind,
    count,
    label: RUN,
    expiresAt,
  });
}

function fakeAdminRequest(headers: Record<string, string>) {
  return new NextRequest(
    "http://localhost:3001/api/admin/licensing/customers",
    { headers },
  );
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl.includes("khata_licensing")) {
    console.error(
      "REFUSING TO RUN: DATABASE_URL is not the isolated khata_licensing database.",
    );
    console.error(dbUrl.replace(/(:\/\/[^:]+:)[^@]+(@)/, "$1***$2"));
    process.exit(1);
  }

  // Clean any leftovers from earlier runs of this suite.
  await prisma.redeemCode.deleteMany({
    where: { label: { startsWith: "licensing-test-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: TEST_DOMAIN } },
  });

  section("1. Regular customer activates a product code");
  const regular = await makeUser("regular");
  const productCode = one(await gen("PRODUCT"));
  const productResult = await redeemLicenseCode(regular.id, productCode.code);
  let ent = await getEntitlement(regular.id);
  check("product redemption succeeds", productResult.success === true);
  check("category becomes REGULAR", ent.category === "REGULAR", ent.category);
  check("core access is active", ent.core.active === true);
  check("core activation time recorded", ent.core.activatedAt instanceof Date);
  check("premium is NOT granted by a product code", ent.premium.active === false);
  check("hasCoreAccess true", (await hasCoreAccess(regular.id)) === true);
  check("hasPremiumAccess false", (await hasPremiumAccess(regular.id)) === false);
  check(
    "exactly one subscription row (no duplicate user records)",
    (await prisma.userSubscription.count({ where: { userId: regular.id } })) === 1,
  );

  section("2. Invalid product code is rejected");
  await expectKey(
    "random code rejected",
    () => redeemLicenseCode(regular.id, "DKH-P-ZZZZ-ZZZZ-ZZZZ"),
    "api.licensing.codeInvalid",
  );

  section("3. A product code cannot be redeemed twice");
  const otherRegular = await makeUser("regular2");
  await expectKey(
    "second redemption of the same product code rejected",
    () => redeemLicenseCode(otherRegular.id, productCode.code),
    "api.licensing.codeUsed",
  );
  check(
    "product code redemption count is exactly 1",
    (await prisma.redeemCode.findFirst({
      where: { codeHash: createHash("sha256").update(productCode.code).digest("hex") },
      select: { redemptionCount: true },
    }))?.redemptionCount === 1,
  );

  section("4. Regular customer cannot access premium");
  check("premium inactive for regular", (await getEntitlement(regular.id)).premium.active === false);
  await expectKey(
    "premium code requires an activated product",
    async () => {
      const fresh = await makeUser("no-product");
      const premium = one(await gen("PREMIUM"));
      return redeemLicenseCode(fresh.id, premium.code);
    },
    "api.licensing.productRequired",
  );

  section("5. Premium code activates 30 days");
  const premium1 = one(await gen("PREMIUM"));
  const premiumResult = await redeemLicenseCode(regular.id, premium1.code);
  ent = await getEntitlement(regular.id);
  const remaining = ent.premium.remainingDays ?? 0;
  check("category becomes PREMIUM", ent.category === "PREMIUM", ent.category);
  check("premium active", ent.premium.active === true);
  check("premium is not permanent", ent.premium.permanent === false);
  check(
    "premium expiry ≈ 30 days",
    remaining >= 29 && remaining <= 30,
    `remaining=${remaining}`,
  );
  check(
    "duration recorded as 30 days",
    premiumResult.durationDays === 30,
    String(premiumResult.durationDays),
  );

  section("6. A premium code cannot be redeemed twice");
  const thirdUser = await makeUser("premium-twice");
  await expectKey(
    "second redemption of the same premium code rejected",
    () => redeemLicenseCode(thirdUser.id, premium1.code),
    "api.licensing.codeUsed",
  );

  section("7–8. Renewal before expiry preserves remaining time");
  const expiryBefore = (await getEntitlement(regular.id)).premium.expiresAt!;
  const premium2 = one(await gen("PREMIUM"));
  await redeemLicenseCode(regular.id, premium2.code);
  const expiryAfter = (await getEntitlement(regular.id)).premium.expiresAt!;
  const addedMs = expiryAfter.getTime() - expiryBefore.getTime();
  check(
    "early renewal adds ~30 days to the existing expiry",
    Math.abs(addedMs - 30 * DAY) < 60_000,
    `added=${Math.round(addedMs / DAY)}d`,
  );

  section("9–11. Expired premium loses premium, keeps core, can renew");
  const expiredUser = await makeUser("expired");
  const p1 = one(await gen("PRODUCT"));
  await redeemLicenseCode(expiredUser.id, p1.code);
  const p2 = one(await gen("PREMIUM"));
  await redeemLicenseCode(expiredUser.id, p2.code);
  await prisma.userSubscription.update({
    where: { userId: expiredUser.id },
    data: { premiumExpiresAt: new Date(Date.now() - DAY) },
  });
  let expiredEnt = await getEntitlement(expiredUser.id);
  check("expired premium is inactive", expiredEnt.premium.active === false);
  check("expired premium retains core access", expiredEnt.core.active === true);
  check("category falls back to REGULAR", expiredEnt.category === "REGULAR", expiredEnt.category);
  const p3 = one(await gen("PREMIUM"));
  await redeemLicenseCode(expiredUser.id, p3.code);
  expiredEnt = await getEntitlement(expiredUser.id);
  const renewDays = expiredEnt.premium.remainingDays ?? 0;
  check(
    "expired subscription renews from now (~30 days)",
    renewDays >= 29 && renewDays <= 30,
    `remaining=${renewDays}`,
  );

  section("12. Affiliate code grants permanent full access");
  const affiliate = await makeUser("affiliate");
  const affCode = one(await gen("AFFILIATE"));
  await redeemLicenseCode(affiliate.id, affCode.code);
  let affEnt = await getEntitlement(affiliate.id);
  check("category becomes AFFILIATE", affEnt.category === "AFFILIATE", affEnt.category);
  check("affiliate has core access", affEnt.core.active === true);
  check("affiliate has premium access", affEnt.premium.active === true);
  check("affiliate premium is permanent", affEnt.premium.permanent === true);
  check("affiliate is not an owner", affEnt.isOwner === false);

  section("13. The 11th affiliate code cannot be generated");
  const existingAffiliate = await prisma.redeemCode.count({ where: { kind: "AFFILIATE" } });
  const room = MAX_AFFILIATE_CODES - existingAffiliate;
  if (room > 0) await gen("AFFILIATE", room);
  check(
    `affiliate code total is ${MAX_AFFILIATE_CODES}`,
    (await prisma.redeemCode.count({ where: { kind: "AFFILIATE" } })) === MAX_AFFILIATE_CODES,
  );
  await expectKey(
    "generating another affiliate code is rejected",
    () => gen("AFFILIATE", 1),
    "api.licensing.affiliateLimit",
  );
  await expectKey(
    "generating a batch beyond the cap is rejected",
    () => gen("AFFILIATE", 2),
    "api.licensing.affiliateLimit",
  );

  section("14. Affiliate entitlement never expires");
  await prisma.userSubscription.update({
    where: { userId: affiliate.id },
    data: { premiumExpiresAt: new Date(Date.now() - 365 * DAY) },
  });
  affEnt = await getEntitlement(affiliate.id);
  check("affiliate premium still active after simulated expiry", affEnt.premium.active === true);
  check("affiliate premium remains permanent", affEnt.premium.permanent === true);

  section("15–16. Owners have permanent full access and survive operations");
  const activeOwners = await prisma.userSubscription.count({
    where: { ownerGrantedAt: { not: null }, ownerRevokedAt: null },
  });
  check(
    "no pre-existing owners in the isolated DB (clean baseline)",
    activeOwners === 0,
    `activeOwners=${activeOwners}`,
  );
  const ownerA = await makeUser("ownerA");
  const ownerB = await makeUser("ownerB");
  const ownerC = await makeUser("ownerC");
  await grantOwner(ownerA.id);
  let ownerEnt = await getEntitlement(ownerA.id);
  check("category becomes OWNER", ownerEnt.category === "OWNER", ownerEnt.category);
  check("owner has core access", ownerEnt.core.active === true);
  check("owner has premium access", ownerEnt.premium.active === true);
  check("owner premium is permanent", ownerEnt.premium.permanent === true);

  await expectKey(
    "owner cannot redeem a product code again",
    async () => {
      const extra = one(await gen("PRODUCT"));
      return redeemLicenseCode(ownerA.id, extra.code);
    },
    "api.licensing.alreadyActivated",
  );
  const ownerPremium = one(await gen("PREMIUM"));
  await expectKey(
    "owner cannot redeem a premium code (already permanent)",
    () => redeemLicenseCode(ownerA.id, ownerPremium.code),
    "api.licensing.alreadyPermanent",
  );
  await revokePremium(ownerA.id);
  ownerEnt = await getEntitlement(ownerA.id);
  check("owner stays OWNER after a premium revocation", ownerEnt.category === "OWNER");
  check("owner keeps premium after premium revocation", ownerEnt.premium.active === true);

  section("Owner cap and accidental-removal protection");
  await grantOwner(ownerB.id);
  await expectKey(
    `a third owner is rejected (max ${MAX_OWNERS})`,
    () => grantOwner(ownerC.id),
    "api.licensing.ownerLimit",
  );
  await expectKey(
    "revoking an owner without confirmation is rejected",
    () => revokeOwner(ownerA.id, false),
    "api.licensing.confirmRequired",
  );
  await revokeOwner(ownerA.id, true);
  check(
    "one owner remains after confirmed revocation",
    (await prisma.userSubscription.count({
      where: { ownerGrantedAt: { not: null }, ownerRevokedAt: null },
    })) === 1,
  );
  await expectKey(
    "the last owner cannot be removed",
    () => revokeOwner(ownerB.id, true),
    "api.licensing.lastOwner",
  );
  await expectKey(
    "owner access cannot be revoked directly",
    () => revokeAccess(ownerB.id, "test"),
    "api.licensing.revokeOwnerFirst",
  );

  section("17–19. Ordinary users cannot self-grant; admin is secret-gated");
  const selfGrant = await makeUser("self-grant");
  await expectKey(
    "a random code cannot grant premium",
    () => redeemLicenseCode(selfGrant.id, "DKH-M-AAAA-AAAA-AAAA"),
    "api.licensing.codeInvalid",
  );
  check(
    "admin: no secret is rejected",
    isAdminRequest(fakeAdminRequest({})) === false,
  );
  check(
    "admin: wrong secret is rejected",
    isAdminRequest(fakeAdminRequest({ "x-admin-secret": "definitely-wrong" })) === false,
  );
  check(
    "admin: the configured secret is accepted",
    Boolean(process.env.ADMIN_SECRET) &&
      isAdminRequest(
        fakeAdminRequest({ "x-admin-secret": process.env.ADMIN_SECRET! }),
      ) === true,
  );

  section("20. Invalid, revoked and expired codes are rejected");
  await expectKey(
    "revoked code rejected",
    async () => {
      const code = one(await gen("PRODUCT"));
      const row = await prisma.redeemCode.findFirstOrThrow({
        where: { codeHash: createHash("sha256").update(code.code).digest("hex") },
        select: { id: true },
      });
      await revokeLicenseCode(row.id);
      return redeemLicenseCode((await makeUser("revoked")).id, code.code);
    },
    "api.licensing.codeInactive",
  );
  await expectKey(
    "expired code rejected",
    async () => {
      const code = one(await gen("PRODUCT", 1, new Date(Date.now() - DAY)));
      return redeemLicenseCode((await makeUser("expired-code")).id, code.code);
    },
    "api.licensing.codeExpired",
  );
  await expectKey(
    "already-redeemed code rejected",
    async () =>
      redeemLicenseCode((await makeUser("used-code")).id, productCode.code),
    "api.licensing.codeUsed",
  );

  section("21. Concurrent redemption of one code succeeds exactly once");
  const raceCode = one(await gen("PRODUCT"));
  const racerA = await makeUser("racerA");
  const racerB = await makeUser("racerB");
  const results = await Promise.allSettled([
    redeemLicenseCode(racerA.id, raceCode.code),
    redeemLicenseCode(racerB.id, raceCode.code),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter((r) => r.status === "rejected").length;
  check("exactly one concurrent redemption succeeded", fulfilled === 1, `fulfilled=${fulfilled}`);
  check("exactly one concurrent redemption failed", rejected === 1, `rejected=${rejected}`);
  check(
    "code redemption count is exactly 1 after the race",
    (await prisma.redeemCode.findFirst({
      where: { codeHash: createHash("sha256").update(raceCode.code).digest("hex") },
      select: { redemptionCount: true },
    }))?.redemptionCount === 1,
  );

  section("Access revocation and restoration");
  const revokable = await makeUser("revokable");
  const rCode = one(await gen("PRODUCT"));
  await redeemLicenseCode(revokable.id, rCode.code);
  await revokeAccess(revokable.id, "test revocation");
  let revEnt = await getEntitlement(revokable.id);
  check("access revocation disables core", revEnt.core.active === false);
  check("access revocation is recorded", revEnt.accessRevoked === true);
  check("revocation reason is stored", revEnt.accessRevokedReason === "test revocation");
  await restoreAccess(revokable.id);
  revEnt = await getEntitlement(revokable.id);
  check("restore access re-enables core", revEnt.core.active === true);

  section("Code security: hashing and no plaintext in listings");
  const secretCode = one(await gen("PRODUCT"));
  const stored = await prisma.redeemCode.findFirstOrThrow({
    where: { codeHash: createHash("sha256").update(secretCode.code).digest("hex") },
    select: { codeHash: true, kind: true, maxRedemptions: true },
  });
  check(
    "code is stored as a SHA-256 hash, not plaintext",
    stored.codeHash === createHash("sha256").update(secretCode.code).digest("hex"),
  );
  check("stored hash is not the plaintext", stored.codeHash !== secretCode.code);
  check("one-time codes use maxRedemptions=1", stored.maxRedemptions === 1);
  const listed = await listLicenseCodes();
  const sample = listed.find((c) => c.label === RUN);
  check(
    "admin listing never exposes plaintext or the hash",
    Boolean(sample) && !("code" in (sample as object)) && !("codeHash" in (sample as object)),
  );

  section("Redemption history and admin overview");
  const history = await getRedemptionHistory(regular.id);
  check("redemption history records entries", history.length >= 3, `entries=${history.length}`);
  check(
    "redemption history records the code kind",
    history.every((h) => typeof h.kind === "string" && h.kind.length > 0),
  );
  const overview = await getLicensingOverview();
  check("overview lists customers", overview.customers.length > 0);
  check("overview lists codes", overview.codes.length > 0);
  check(
    "overview enforces the affiliate cap summary",
    overview.summary.affiliateCodesTotal === MAX_AFFILIATE_CODES &&
      overview.summary.affiliateCodesRemaining === 0,
  );
  const overviewRegular = overview.customers.find((c) => c.id === regular.id);
  check(
    "overview customer includes activation history",
    Boolean(overviewRegular) && (overviewRegular?.history.length ?? 0) >= 3,
    `entries=${overviewRegular?.history.length ?? 0}`,
  );
  check(
    "overview history records code kinds",
    Boolean(overviewRegular) &&
      (overviewRegular?.history ?? []).every((h) => typeof h.kind === "string"),
  );
  check(
    "overview codes expose who redeemed them",
    overview.codes.some((c) => c.redemptions.length > 0),
  );

  section("22. The 14-day trial is preserved as core-only access");
  const trialUser = await makeUser("trial");
  await createTrial(trialUser.id);
  let trialEnt = await getEntitlement(trialUser.id);
  check("fresh user is on TRIAL", trialEnt.category === "TRIAL", trialEnt.category);
  check("trial grants core access", trialEnt.core.active === true);
  check("trial core is flagged as trial", trialEnt.core.trial === true);
  check("trial core has an expiry", Boolean(trialEnt.core.expiresAt));
  check("trial does not grant premium", trialEnt.premium.active === false);
  check(
    "trial user has core access via hasCoreAccess",
    (await hasCoreAccess(trialUser.id)) === true,
  );
  check(
    "trial user does not have premium access",
    (await hasPremiumAccess(trialUser.id)) === false,
  );
  const trialPremium = await makeUser("trial-premium");
  await createTrial(trialPremium.id);
  await prisma.userSubscription.update({
    where: { userId: trialPremium.id },
    data: { premiumExpiresAt: new Date(Date.now() + 30 * DAY) },
  });
  const trialPremiumEnt = await getEntitlement(trialPremium.id);
  check(
    "premium time on a trial does not grant premium",
    trialPremiumEnt.premium.active === false,
  );
  check(
    "trial with premium time stays TRIAL",
    trialPremiumEnt.category === "TRIAL",
    trialPremiumEnt.category,
  );
  const trialOverview = await getLicensingOverview();
  check(
    "overview counts trial customers",
    trialOverview.summary.trial >= 1,
    `trial=${trialOverview.summary.trial}`,
  );
  await expectKey(
    "trial user cannot redeem premium before buying product",
    async () => {
      const premium = one(await gen("PREMIUM"));
      return redeemLicenseCode(trialUser.id, premium.code);
    },
    "api.licensing.productRequired",
  );
  const upgrade = one(await gen("PRODUCT"));
  await redeemLicenseCode(trialUser.id, upgrade.code);
  trialEnt = await getEntitlement(trialUser.id);
  check(
    "trial user can upgrade to permanent core",
    trialEnt.category === "REGULAR",
    trialEnt.category,
  );
  check(
    "paid core is permanent after upgrade",
    trialEnt.core.trial === false && trialEnt.core.expiresAt === null,
  );

  section("23. Expired trial loses access and can activate a product");
  const trialExpired = await makeUser("trial-expired");
  await prisma.userSubscription.upsert({
    where: { userId: trialExpired.id },
    create: {
      userId: trialExpired.id,
      status: "TRIAL_ACTIVE",
      trialStartedAt: new Date(Date.now() - 60 * DAY),
      trialExpiresAt: new Date(Date.now() - 30 * DAY),
      coreActivatedAt: new Date(Date.now() - 60 * DAY),
      coreExpiresAt: new Date(Date.now() - 30 * DAY),
    },
    update: {
      coreActivatedAt: new Date(Date.now() - 60 * DAY),
      coreExpiresAt: new Date(Date.now() - 30 * DAY),
    },
  });
  let expiredTrialEnt = await getEntitlement(trialExpired.id);
  check(
    "expired trial is UNACTIVATED",
    expiredTrialEnt.category === "UNACTIVATED",
    expiredTrialEnt.category,
  );
  check("expired trial has no core access", expiredTrialEnt.core.active === false);
  check("expired trial is still flagged as trial", expiredTrialEnt.core.trial === true);
  const reactivate = one(await gen("PRODUCT"));
  await redeemLicenseCode(trialExpired.id, reactivate.code);
  expiredTrialEnt = await getEntitlement(trialExpired.id);
  check("expired trial can activate a product", expiredTrialEnt.category === "REGULAR");
  check("reactivated core is permanent", expiredTrialEnt.core.expiresAt === null);

  section("24. Affiliate and core revocation");
  const demote = await makeUser("demote");
  const demoteProduct = one(await gen("PRODUCT"));
  await redeemLicenseCode(demote.id, demoteProduct.code);
  await prisma.userSubscription.update({
    where: { userId: demote.id },
    data: {
      affiliateGrantedAt: new Date(),
      affiliateRevokedAt: null,
      premiumExpiresAt: null,
    },
  });
  let demoteEnt = await getEntitlement(demote.id);
  check("seeded affiliate is AFFILIATE", demoteEnt.category === "AFFILIATE", demoteEnt.category);
  await expectKey(
    "revokeAffiliate requires confirmation",
    () => revokeAffiliate(demote.id, false),
    "api.licensing.confirmRequired",
  );
  demoteEnt = await revokeAffiliate(demote.id, true);
  check(
    "revokeAffiliate demotes to REGULAR",
    demoteEnt.category === "REGULAR",
    demoteEnt.category,
  );
  check(
    "revokeAffiliate keeps permanent core",
    demoteEnt.core.active === true && demoteEnt.core.trial === false,
  );
  await expectKey(
    "revokeCore on an affiliate is rejected (demote first)",
    () => revokeCore(affiliate.id, true),
    "api.licensing.demoteFirst",
  );
  demoteEnt = await revokeCore(demote.id, true);
  check("revokeCore removes core access", demoteEnt.core.active === false);
  check("revokeCore removes premium access", demoteEnt.premium.active === false);
  check("revoked core user is UNACTIVATED", demoteEnt.category === "UNACTIVATED");

  section("25. Legacy admin generator is fixed at a 30-day premium period");
  const legacy = await generateCodes({ durationDays: 365, maxRedemptions: 1, count: 1 });
  check(
    "legacy generator forces 30 days regardless of input",
    legacy[0]?.durationDays === 30,
    `duration=${legacy[0]?.durationDays}`,
  );
  if (legacy[0]) {
    await prisma.redeemCode.deleteMany({
      where: {
        codeHash: createHash("sha256")
          .update(legacy[0].code.toUpperCase().trim())
          .digest("hex"),
      },
    });
  }

  section("Cleanup");
  await prisma.redeemCode.deleteMany({
    where: { label: { startsWith: "licensing-test-" } },
  });
  await prisma.user.deleteMany({
    where: { email: { endsWith: TEST_DOMAIN } },
  });

  console.log(`\n${passed} passed, ${failed} failed (${passed + failed} checks)`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("Test suite crashed:", error);
  await prisma.$disconnect();
  process.exit(1);
});