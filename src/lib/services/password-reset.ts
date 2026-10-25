/**
 * Admin-issued password reset codes.
 *
 * Flow:
 *   1. The admin (holding ADMIN_SECRET) asks for a code for one email.
 *   2. A 12-character, single-use code is shown once and stored only as a
 *      salted SHA-256 hash.
 *   3. The user opens /reset-password, enters the code and a new password.
 *   4. The code is consumed, every other outstanding code for that account is
 *      revoked, and the password hash is replaced.
 *
 * Safety rules:
 *   - A code expires after 30 minutes.
 *   - A code is invalid after one successful use.
 *   - Issuing a new code revokes all older unused codes for that account.
 *   - Five wrong attempts revoke the active code; the admin must issue a new one.
 *   - The plaintext code is never stored, logged, or written to the audit trail.
 *   - The public reset endpoint returns one generic error for a wrong email,
 *     wrong code, expired code, or revoked code, so it cannot be used to probe
 *     which email addresses have accounts.
 */

import { createHash, randomInt, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { recordAudit } from "@/lib/services/audit";

export const RESET_CODE_TTL_MINUTES = 30;
export const MAX_RESET_ATTEMPTS = 5;

const RESET_CODE_TTL_MS = RESET_CODE_TTL_MINUTES * 60 * 1000;
const BCRYPT_ROUNDS = 10;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const CODE_SEGMENTS = 3;
const SEGMENT_LENGTH = 4;

export type IssuedResetCode = {
  code: string;
  expiresAt: Date;
  user: { id: string; name: string; email: string };
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Remove spaces/dashes and uppercase the code before hashing/comparing. */
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getPepper(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to a 32+ char string in production.");
    }
    return "dev-insecure-reset-pepper-DO-NOT-USE-IN-PRODUCTION";
  }
  return secret;
}

/**
 * A server-side pepper means a leaked database hash cannot be tested against
 * a candidate code without also knowing SESSION_SECRET.
 */
function hashCode(code: string): string {
  return createHash("sha256")
    .update(`${normalizeCode(code)}:${getPepper()}`)
    .digest("hex");
}

function codeMatches(plainCode: string, storedHash: string): boolean {
  try {
    const candidate = Buffer.from(hashCode(plainCode), "hex");
    const stored = Buffer.from(storedHash, "hex");
    if (candidate.length !== stored.length) return false;
    return timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

function generateCode(): string {
  const segments: string[] = [];
  for (let s = 0; s < CODE_SEGMENTS; s++) {
    let segment = "";
    for (let i = 0; i < SEGMENT_LENGTH; i++) {
      segment += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!;
    }
    segments.push(segment);
  }
  return segments.join("-");
}

/**
 * Issue one reset code for an email. Older unused codes for that account are
 * revoked in the same transaction, so only the newest code can work.
 */
export async function issuePasswordResetCode(
  emailInput: string,
): Promise<IssuedResetCode> {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    throw new BadRequestError("api.password.resetEmailRequired");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    throw new NotFoundError("api.resource.user");
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_CODE_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetCode.updateMany({
      where: { userId: user.id, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.passwordResetCode.create({
      data: { userId: user.id, codeHash, expiresAt },
    });
  });

  await recordAudit(user.id, {
    action: "password.reset_code_issued",
    entityType: "User",
    entityId: user.id,
    summary: "Password reset code issued by admin",
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  return { code, expiresAt, user };
}

/**
 * Consume a reset code and replace the password.
 *
 * The generic `resetInvalid` error is deliberate: callers must not learn
 * whether the email exists, whether the code expired, or whether it was
 * already used.
 */
export async function resetPasswordWithCode(input: {
  email: string;
  code: string;
  newPassword: string;
}): Promise<{ reset: true }> {
  const email = normalizeEmail(input.email);
  const code = normalizeCode(input.code);

  if (!email || !email.includes("@")) {
    throw new BadRequestError("api.password.resetEmailRequired");
  }
  if (!code) {
    throw new BadRequestError("api.password.resetCodeRequired");
  }
  if (!input.newPassword || input.newPassword.length < 6) {
    throw new BadRequestError("api.password.tooShort");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new BadRequestError("api.password.resetInvalid");
  }

  const now = new Date();
  const activeCodes = await prisma.passwordResetCode.findMany({
    where: {
      userId: user.id,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
      attempts: { lt: MAX_RESET_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const match = activeCodes.find((candidate) => codeMatches(code, candidate.codeHash));
  if (!match) {
    const newest = activeCodes[0];
    if (newest) {
      const nextAttempts = newest.attempts + 1;
      await prisma.passwordResetCode.update({
        where: { id: newest.id },
        data: {
          attempts: { increment: 1 },
          ...(nextAttempts >= MAX_RESET_ATTEMPTS ? { revokedAt: now } : {}),
        },
      });
    }
    throw new BadRequestError("api.password.resetInvalid");
  }

  const newHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    // Conditional update prevents two simultaneous requests from both using
    // the same code.
    const consumed = await tx.passwordResetCode.updateMany({
      where: {
        id: match.id,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: MAX_RESET_ATTEMPTS },
      },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw new BadRequestError("api.password.resetInvalid");
    }

    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });

    // A password change invalidates every other outstanding reset code.
    await tx.passwordResetCode.updateMany({
      where: {
        userId: user.id,
        id: { not: match.id },
        usedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  });

  await recordAudit(user.id, {
    action: "password.reset",
    entityType: "User",
    entityId: user.id,
    summary: "Password reset with an admin-issued code",
  });

  return { reset: true };
}

/** Revoke any outstanding reset codes, e.g. after a normal password change. */
export async function revokePasswordResetCodes(userId: string): Promise<void> {
  await prisma.passwordResetCode.updateMany({
    where: { userId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
