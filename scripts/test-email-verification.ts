/**
 * Email verification tests — pure functions, no database, no network.
 *
 * Covers:
 *   - code format (six digits, leading zeros preserved)
 *   - the peppered hash (deterministic per secret, differs from a bare hash,
 *     differs when the pepper changes)
 *   - TTL math
 *   - the attempt-cap decision table
 *   - code normalisation (" 123 456 " → "123456", Urdu numerals)
 *   - the enforcement flag's default
 *   - the email template's content (spaced code, expiry, bilingual)
 *
 * Usage: npm run test:email-verification
 * Exits non-zero when anything fails.
 */

import { createHash } from "node:crypto";
import {
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_DAY,
  RESEND_COOLDOWN_SECONDS,
  formatVerificationCodeForDisplay,
  generateVerificationCode,
  hashVerificationCode,
  isEmailVerificationEnforced,
  isValidVerificationCode,
  normaliseVerificationCode,
  planVerificationAttempt,
  verificationCodeMatches,
  verificationExpiry,
} from "../src/lib/services/email-verification";
import { buildVerificationEmail } from "../src/lib/email/templates";

let pass = 0;
let fail = 0;

function check(condition: boolean, label: string) {
  if (condition) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}`);
  }
}

function equal<T>(actual: T, expected: T, label: string) {
  check(
    actual === expected,
    `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
  );
}

// ── Constants ────────────────────────────────────────────────────────────────
equal(CODE_LENGTH, 6, "CODE_LENGTH is 6");
equal(CODE_TTL_MINUTES, 10, "CODE_TTL_MINUTES is 10");
equal(MAX_ATTEMPTS, 5, "MAX_ATTEMPTS is 5");
equal(RESEND_COOLDOWN_SECONDS, 60, "RESEND_COOLDOWN_SECONDS is 60");
equal(MAX_SENDS_PER_DAY, 5, "MAX_SENDS_PER_DAY is 5");

// ── Code format (leading zeros preserved) ────────────────────────────────────
const codes = Array.from({ length: 3000 }, () => generateVerificationCode());
check(
  codes.every((code) => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)),
  "every generated code is exactly six digits",
);
check(
  codes.every((code) => code.length === CODE_LENGTH),
  "every generated code has length 6",
);
check(
  codes.some((code) => code.startsWith("0")),
  "leading zeros are preserved (a code starting with 0 was produced)",
);
equal(
  formatVerificationCodeForDisplay("000123"),
  "0 0 0 1 2 3",
  "display formatting spaces every digit, including leading zeros",
);

// ── Normalisation ────────────────────────────────────────────────────────────
equal(normaliseVerificationCode(" 123 456 "), "123456", "' 123 456 ' normalises to '123456'");
equal(normaliseVerificationCode("123-456"), "123456", "dashes are ignored");
equal(normaliseVerificationCode("۱۲۳۴۵۶"), "123456", "Urdu/Arabic-Indic numerals map to ASCII");
equal(normaliseVerificationCode("abc"), "", "letters are stripped");
equal(normaliseVerificationCode(""), "", "empty input stays empty");
check(isValidVerificationCode(" 123 456 "), "a spaced six-digit code is valid");
check(!isValidVerificationCode("12345"), "five digits are not valid");
check(!isValidVerificationCode("1234567"), "seven digits are not valid");

// ── Hash: peppered, deterministic, timing-safe compare ───────────────────────
const previousSecret = process.env.SESSION_SECRET;

process.env.SESSION_SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const hashA = hashVerificationCode("123456");
const hashB = hashVerificationCode("123456");
const hashC = hashVerificationCode("123457");
const bare = createHash("sha256").update("123456").digest("hex");

check(/^[0-9a-f]{64}$/.test(hashA), "hash is a 64-char lowercase hex digest");
equal(hashA, hashB, "hash is deterministic for the same code and pepper");
check(hashA !== hashC, "a different code hashes differently");
check(hashA !== bare, "the stored hash is peppered (not a bare sha256 of the code)");

process.env.SESSION_SECRET = "another-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const hashOtherPepper = hashVerificationCode("123456");
check(hashA !== hashOtherPepper, "a different SESSION_SECRET produces a different hash");

process.env.SESSION_SECRET = "test-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
check(verificationCodeMatches("123456", hashA), "the correct code matches");
check(verificationCodeMatches(" 123 456 ", hashA), "a spaced correct code matches");
check(!verificationCodeMatches("654321", hashA), "a wrong code does not match");
check(!verificationCodeMatches("123456", "not-a-hash"), "a malformed stored hash fails closed");

// ── TTL math ─────────────────────────────────────────────────────────────────
const fixed = new Date("2026-11-17T10:00:00.000Z");
const expiry = verificationExpiry(fixed);
equal(
  expiry.getTime() - fixed.getTime(),
  CODE_TTL_MINUTES * 60 * 1000,
  "expiry is exactly 10 minutes after issue",
);
equal(
  expiry.toISOString(),
  "2026-11-17T10:10:00.000Z",
  "expiry timestamp is issue time + 10 minutes",
);

// ── Attempt-cap decision table ───────────────────────────────────────────────
const table: Array<[number, number, boolean, boolean]> = [
  [0, 1, false, false],
  [1, 2, false, false],
  [3, 4, false, false],
  [4, 5, false, true],
  [5, 6, true, true],
  [9, 10, true, true],
];
for (const [before, after, blocked, revoke] of table) {
  const plan = planVerificationAttempt(before);
  equal(plan.attemptsAfter, after, `attempt ${before} → counter ${after}`);
  equal(plan.blocked, blocked, `attempt ${before} → blocked=${blocked}`);
  equal(plan.revoke, revoke, `attempt ${before} → revoke=${revoke}`);
}
const negative = planVerificationAttempt(-3);
equal(negative.attemptsAfter, 1, "a negative stored counter is clamped to 0 before increment");

// ── Enforcement defaults OFF ─────────────────────────────────────────────────
delete process.env.EMAIL_VERIFICATION_ENFORCED;
equal(isEmailVerificationEnforced(), false, "enforcement defaults to OFF when unset");
process.env.EMAIL_VERIFICATION_ENFORCED = "false";
equal(isEmailVerificationEnforced(), false, "'false' is OFF");
process.env.EMAIL_VERIFICATION_ENFORCED = "1";
equal(isEmailVerificationEnforced(), false, "'1' is OFF (only the exact string 'true' enables)");
process.env.EMAIL_VERIFICATION_ENFORCED = "true";
equal(isEmailVerificationEnforced(), true, "the exact string 'true' enables enforcement");
delete process.env.EMAIL_VERIFICATION_ENFORCED;

// ── Email template ───────────────────────────────────────────────────────────
const mail = buildVerificationEmail({ name: "Ayesha", code: "012345" });
check(mail.subject.includes("Dukhata"), "subject mentions the brand");
check(mail.text.includes("0 1 2 3 4 5"), "text contains the spaced code");
check(mail.text.includes("10 minutes"), "text states the 10-minute expiry");
check(mail.text.includes("ignore this email"), "text explains what to do if unrequested");
check(mail.text.includes("دکھاتہ"), "text carries the Urdu line");
check(mail.html.includes("0 1 2 3 4 5"), "html contains the spaced code");
check(mail.html.includes('lang="ur"'), "html marks the Urdu block");
check(!mail.html.includes("<script"), "html has no script tags");

// Restore the environment so a developer's shell is untouched.
if (previousSecret === undefined) delete process.env.SESSION_SECRET;
else process.env.SESSION_SECRET = previousSecret;

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error("Email verification tests FAILED");
  process.exit(1);
}
console.log("Email verification tests passed");