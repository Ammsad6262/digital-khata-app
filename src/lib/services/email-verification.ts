/**
 * Email verification — 6-digit one-time codes.
 *
 * Flow:
 *   1. A signed-in account asks for a code (`issueVerificationCode`).
 *   2. A 6-digit code is generated with `crypto.randomInt` (leading zeros
 *      allowed) and emailed. Only `sha256(code + ":" + SESSION_SECRET)` is
 *      stored — the plaintext exists only inside the request that sends it.
 *   3. The user submits the code (`confirmVerificationCode`). The attempt is
 *      counted BEFORE the comparison, so a burst of guesses cannot exceed the
 *      cap. Five wrong attempts retire the code; the recovery path is "resend".
 *   4. Success sets `EmailVerificationCode.consumedAt` and `User.emailVerifiedAt`
 *      in one transaction and revokes every other outstanding code.
 *
 * Safety rules:
 *   - A code expires after 10 minutes.
 *   - One code per account is live at a time (issuing revokes the older ones).
 *   - 60-second cooldown between sends, 5 sends per rolling 24 hours.
 *   - The plaintext code is never stored, logged, or written to the audit trail.
 *   - Enforcement is controlled by EMAIL_VERIFICATION_ENFORCED and defaults to
 *     OFF, so a deployment without an email provider can never lock anyone out.
 */

import { createHash, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { AppError, BadRequestError, ErrorCode, NotFoundError } from "@/lib/errors";

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_SENDS_PER_DAY = 5;

const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN_SECONDS * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Arabic-Indic (U+0660…) and Extended Arabic-Indic / Urdu (U+06F0…) digits.
// A numeric keyboard usually produces ASCII digits, but a pasted code from an
// Urdu keyboard can carry the local numerals. Treat both as the same digits.
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

// ────────────────────────────────────────────────────────────────────────────
// Typed errors (routes map these to status codes + translation keys)
// ────────────────────────────────────────────────────────────────────────────

/** 429 — a code was issued less than RESEND_COOLDOWN_SECONDS ago. */
export class EmailVerificationCooldownError extends AppError {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("api.verify.cooldown", ErrorCode.BAD_REQUEST, 429, undefined, {
      seconds: retryAfter,
    });
    this.name = "EmailVerificationCooldownError";
    this.retryAfter = retryAfter;
  }
}

/** 429 — the rolling 24-hour send cap has been reached. */
export class EmailVerificationDailyLimitError extends AppError {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("api.verify.dailyLimit", ErrorCode.BAD_REQUEST, 429);
    this.name = "EmailVerificationDailyLimitError";
    this.retryAfter = Math.max(60, Math.ceil(retryAfter));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests — no DB, no network)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Keep digits only, mapping Arabic-Indic numerals to ASCII.
 *
 *   " 123 456 "  → "123456"
 *   "۱۲۳۴۵۶"     → "123456"
 */
export function normaliseVerificationCode(input: string): string {
  if (!input) return "";
  let out = "";
  for (const char of input) {
    const asciiIndex = ARABIC_INDIC_DIGITS.indexOf(char);
    if (asciiIndex >= 0) {
      out += String(asciiIndex);
      continue;
    }
    const urduIndex = EXTENDED_ARABIC_DIGITS.indexOf(char);
    if (urduIndex >= 0) {
      out += String(urduIndex);
      continue;
    }
    if (char >= "0" && char <= "9") out += char;
  }
  return out;
}

/** A code is exactly CODE_LENGTH ASCII digits after normalisation. */
export function isValidVerificationCode(input: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(normaliseVerificationCode(input));
}

function getPepper(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to a 32+ char string in production.");
    }
    return "dev-insecure-verify-pepper-DO-NOT-USE-IN-PRODUCTION";
  }
  return secret;
}

/**
 * Store only the peppered hash. A leaked database row cannot be tested against
 * candidate codes without also knowing SESSION_SECRET.
 */
export function hashVerificationCode(code: string): string {
  return createHash("sha256")
    .update(`${normaliseVerificationCode(code)}:${getPepper()}`)
    .digest("hex");
}

/** Timing-safe comparison of a plaintext code against a stored hash. */
export function verificationCodeMatches(plainCode: string, storedHash: string): boolean {
  try {
    const candidate = Buffer.from(hashVerificationCode(plainCode), "hex");
    const stored = Buffer.from(storedHash, "hex");
    if (candidate.length !== stored.length) return false;
    return timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

/** Expiry for a code issued at `now` (defaults to the current instant). */
export function verificationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CODE_TTL_MS);
}

/**
 * Attempt-cap decision table.
 *
 * `attemptsBefore` is the stored counter (number of failed comparisons so far).
 * An attempt is always counted before the comparison:
 *
 *   before  after  blocked  revoke
 *        0      1    false   false
 *        3      4    false   false
 *        4      5    false   true   ← the 5th guess is the last
 *        5      6    true    true   ← safety net (race / legacy row)
 *
 * `blocked` means "do not compare — the cap is already exceeded". `revoke`
 * means the code must be retired after this attempt (success consumes it
 * anyway; a failure at the boundary retires it too).
 */
export type VerificationAttemptPlan = {
  attemptsAfter: number;
  blocked: boolean;
  revoke: boolean;
};

export function planVerificationAttempt(attemptsBefore: number): VerificationAttemptPlan {
  const safeBefore = Number.isFinite(attemptsBefore) ? Math.max(0, Math.floor(attemptsBefore)) : 0;
  const attemptsAfter = safeBefore + 1;
  const blocked = attemptsAfter > MAX_ATTEMPTS;
  return {
    attemptsAfter,
    blocked,
    revoke: blocked || attemptsAfter >= MAX_ATTEMPTS,
  };
}

/** Six digits, leading zeros preserved (000123 is a valid code). */
export function generateVerificationCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** Enforcement is OFF unless the deployment explicitly opts in. */
export function isEmailVerificationEnforced(): boolean {
  return process.env.EMAIL_VERIFICATION_ENFORCED === "true";
}

/** Present a spaced code for humans: "123456" → "1 2 3 4 5 6". */
export function formatVerificationCodeForDisplay(code: string): string {
  return normaliseVerificationCode(code).split("").join(" ");
}

// ────────────────────────────────────────────────────────────────────────────
// Issue
// ────────────────────────────────────────────────────────────────────────────

export type IssuedVerificationCode = {
  code: string;
  expiresAt: Date;
  user: { name: string; email: string };
};

/**
 * Issue one verification code for a user.
 *
 * Older unconsumed codes are revoked in the same transaction, so only the
 * newest code can succeed. Throws `EmailVerificationCooldownError` or
 * `EmailVerificationDailyLimitError` (both carry `retryAfter`).
 */
export async function issueVerificationCode(userId: string): Promise<IssuedVerificationCode> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, emailVerifiedAt: true },
  });
  if (!user) throw new NotFoundError("api.resource.user");
  if (user.emailVerifiedAt) throw new BadRequestError("api.verify.alreadyVerified");

  const now = new Date();

  // 60-second cooldown — measured from the newest issued code (including one
  // that was already consumed), so "resend" cannot be used as a mail bomb.
  const newest = await prisma.emailVerificationCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (newest) {
    const elapsedMs = now.getTime() - newest.createdAt.getTime();
    if (elapsedMs < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000));
      throw new EmailVerificationCooldownError(retryAfter);
    }
  }

  // Rolling 24-hour cap. Retry-after is when the oldest send in the window
  // ages out, so the client can show an honest wait.
  const windowStart = new Date(now.getTime() - DAY_MS);
  const sentInWindow = await prisma.emailVerificationCode.count({
    where: { userId, createdAt: { gte: windowStart } },
  });
  if (sentInWindow >= MAX_SENDS_PER_DAY) {
    const oldest = await prisma.emailVerificationCode.findFirst({
      where: { userId, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const freeAtMs = oldest ? oldest.createdAt.getTime() + DAY_MS : now.getTime() + DAY_MS;
    throw new EmailVerificationDailyLimitError((freeAtMs - now.getTime()) / 1000);
  }

  const code = generateVerificationCode();
  const codeHash = hashVerificationCode(code);
  const expiresAt = verificationExpiry(now);

  await prisma.$transaction(async (tx) => {
    // Revoke every still-live code: only the newest one may work.
    await tx.emailVerificationCode.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.emailVerificationCode.create({
      data: { userId, codeHash, expiresAt },
    });
  });

  return { code, expiresAt, user: { name: user.name, email: user.email } };
}

// ────────────────────────────────────────────────────────────────────────────
// Confirm
// ────────────────────────────────────────────────────────────────────────────

export type ConfirmVerificationResult =
  | { status: "ok"; verifiedAt: Date }
  | { status: "already_verified" }
  | { status: "expired" }
  | { status: "too_many_attempts" }
  | { status: "invalid" };

/**
 * Check a submitted code.
 *
 * Discriminated result — the route turns it into an HTTP status and a
 * translation key; this function never throws for an ordinary wrong code.
 */
export async function confirmVerificationCode(
  userId: string,
  codeInput: string,
): Promise<ConfirmVerificationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, emailVerifiedAt: true },
  });
  if (!user) throw new NotFoundError("api.resource.user");
  if (user.emailVerifiedAt) return { status: "already_verified" };

  const code = normaliseVerificationCode(codeInput);
  if (code.length !== CODE_LENGTH) return { status: "invalid" };

  const now = new Date();
  const newest = await prisma.emailVerificationCode.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  // No live code at all: either one was never requested or a newer one
  // revoked it. "Resend" is the recovery path, so this is not "expired".
  if (!newest) return { status: "invalid" };

  if (newest.expiresAt.getTime() <= now.getTime()) {
    await prisma.emailVerificationCode
      .updateMany({ where: { id: newest.id, consumedAt: null }, data: { consumedAt: now } })
      .catch(() => undefined);
    return { status: "expired" };
  }

  const plan = planVerificationAttempt(newest.attempts);

  // Count the attempt BEFORE comparing. Every request spends one, whether or
  // not the digits match, so guessing cannot be parallelised past the cap.
  await prisma.emailVerificationCode.update({
    where: { id: newest.id },
    data: { attempts: { increment: 1 } },
  });

  if (plan.blocked) {
    await prisma.emailVerificationCode
      .updateMany({ where: { id: newest.id, consumedAt: null }, data: { consumedAt: now } })
      .catch(() => undefined);
    return { status: "too_many_attempts" };
  }

  if (!verificationCodeMatches(code, newest.codeHash)) {
    if (plan.revoke) {
      await prisma.emailVerificationCode
        .updateMany({ where: { id: newest.id, consumedAt: null }, data: { consumedAt: now } })
        .catch(() => undefined);
      return { status: "too_many_attempts" };
    }
    return { status: "invalid" };
  }

  const verifiedAt = new Date();
  const consumed = await prisma.$transaction(async (tx) => {
    // Conditional update: two simultaneous correct submissions cannot both
    // claim the code.
    const claimed = await tx.emailVerificationCode.updateMany({
      where: {
        id: newest.id,
        consumedAt: null,
        expiresAt: { gt: verifiedAt },
      },
      data: { consumedAt: verifiedAt },
    });
    if (claimed.count === 0) return false;

    await tx.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: verifiedAt },
    });

    // Any other outstanding code is now pointless.
    await tx.emailVerificationCode.updateMany({
      where: { userId, id: { not: newest.id }, consumedAt: null },
      data: { consumedAt: verifiedAt },
    });

    return true;
  });

  if (!consumed) return { status: "expired" };
  return { status: "ok", verifiedAt };
}