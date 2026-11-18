/**
 * Trial claims — one free trial per mailbox, not one per deleted account.
 *
 * A user's trial lives on `UserSubscription`, which is deleted with the user
 * (`ON DELETE CASCADE`). That meant someone could use the 14-day trial, delete
 * their account, and sign up again with the same address for another 14 days,
 * indefinitely.
 *
 * `TrialClaim` is deliberately **not** owned by a user, so deleting an account
 * cannot delete the record that its trial was used. Registration consults it
 * before granting a trial; a returning address gets an UNACTIVATED account
 * (it can sign in and redeem a code, but gets no second trial).
 *
 * Only a SHA-256 of the normalised address is stored, never the address itself.
 * The rule for normalising it lives in `trial-claim-hash.ts`, which has no
 * database dependency so tests and scripts share exactly one definition.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hashTrialEmail } from "@/lib/services/trial-claim-hash";

export { hashTrialEmail, normalizeEmailForTrial } from "@/lib/services/trial-claim-hash";

export type TrialClaimOutcome = { granted: boolean };

/**
 * Decide whether this address may start a free trial, and record the decision.
 *
 * Must run inside the same transaction that creates the user and its
 * subscription, so a failure later (a duplicate address, a crash) rolls the
 * claim back and does not burn a trial that was never actually given.
 */
export async function claimTrialSlot(
  tx: Prisma.TransactionClient,
  email: string,
  now: Date = new Date(),
): Promise<TrialClaimOutcome> {
  const emailHash = hashTrialEmail(email);

  // `ab@gmail.com` and `a.b@gmail.com` are different `User.email` values, so
  // the unique index on User does not serialise them. This does.
  await tx.$queryRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1))",
    emailHash,
  );

  const existing = await tx.trialClaim.findUnique({ where: { emailHash } });
  if (existing) return { granted: false };

  await tx.trialClaim.create({
    data: { emailHash, trialGrantedAt: now },
  });
  return { granted: true };
}

/** Read-only check, used by the admin tooling and the regression test. */
export async function hasUsedTrial(email: string): Promise<boolean> {
  const claim = await prisma.trialClaim.findUnique({
    where: { emailHash: hashTrialEmail(email) },
    select: { id: true },
  });
  return claim !== null;
}
