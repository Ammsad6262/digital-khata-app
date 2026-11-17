/**
 * Step-up email confirmation for destructive account actions.
 *
 * Deleting the account, changing the password, wiping the business data and
 * exporting everything are the four things a thief with an unlocked phone would
 * want to do. Each one now requires a 6-digit code that only reaches the
 * owner's email inbox.
 *
 * STATELESS BY DESIGN. The code is never stored: the server puts
 * `{ userId, action, hash(code), expiry }` inside an HMAC-signed token and hands
 * that to the client. Verifying means checking the signature, the expiry, the
 * action, and the code hash. That means:
 *
 *   - no new database table and no migration, so nothing here can interfere
 *     with the very actions it guards (wiping data, deleting the account);
 *   - a stolen token is useless without the emailed code;
 *   - the code cannot be replayed after 10 minutes, or against a different
 *     action or a different user.
 *
 * This module is deliberately free of Next.js imports so it can be unit-tested
 * directly (see scripts/qa-action-confirmation.mts).
 */

import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";

export const ACTION_CODE_LENGTH = 6;
export const ACTION_CODE_TTL_MS = 10 * 60 * 1000;

export const CONFIRMABLE_ACTIONS = [
  "delete_account",
  "change_password",
  "clear_data",
  "export_data",
  "reset_pin",
] as const;

export type ConfirmableAction = (typeof CONFIRMABLE_ACTIONS)[number];

export function isConfirmableAction(value: unknown): value is ConfirmableAction {
  return typeof value === "string" && (CONFIRMABLE_ACTIONS as readonly string[]).includes(value);
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to a 32+ char string in production.");
    }
    return "dev-insecure-secret-DO-NOT-USE-IN-PRODUCTION";
  }
  return value;
}

/** Code hash, peppered so a leaked token cannot be brute-forced offline. */
function codeHash(code: string): string {
  return createHash("sha256").update(`${secret()}:${code}`).digest("hex");
}

/** A fresh 6-digit code, including leading zeros. */
export function generateActionCode(): string {
  return String(randomInt(0, 10 ** ACTION_CODE_LENGTH)).padStart(ACTION_CODE_LENGTH, "0");
}

/** Keep only digits and cap the length, so pasted spaces/dashes still work. */
export function normaliseActionCode(input: string): string {
  return input.replace(/\D/g, "").slice(0, ACTION_CODE_LENGTH);
}

export function isValidActionCode(input: string): boolean {
  return normaliseActionCode(input).length === ACTION_CODE_LENGTH;
}

type TokenPayload = { u: string; a: ConfirmableAction; c: string; e: number };

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Build the signed token the client holds while the owner types the code. */
export function createActionToken(
  userId: string,
  action: ConfirmableAction,
  code: string,
  now: number = Date.now(),
): string {
  const payload: TokenPayload = {
    u: userId,
    a: action,
    c: codeHash(code),
    e: now + ACTION_CODE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export type ActionTokenFailure = "malformed" | "expired" | "wrong_action" | "wrong_code";

export type ActionTokenResult = { ok: true } | { ok: false; reason: ActionTokenFailure };

/**
 * Check a submitted token + code. Never throws for an ordinary wrong code; the
 * caller turns the reason into a status and a translation key.
 */
export function verifyActionToken(
  token: string,
  userId: string,
  action: ConfirmableAction,
  code: string,
  now: number = Date.now(),
): ActionTokenResult {
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    return { ok: false, reason: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "malformed" };
  }
  const [body, signature] = parts as [string, string];

  // Constant-time signature check before trusting anything inside the body.
  const expected = Buffer.from(sign(body), "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "malformed" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload?.e !== "number" || typeof payload?.u !== "string" || typeof payload?.c !== "string") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.u !== userId) return { ok: false, reason: "malformed" };
  if (now > payload.e) return { ok: false, reason: "expired" };
  // An expiry outside the expected window means the payload was not produced by
  // this server, even though the signature matched — refuse it.
  if (payload.e - now > ACTION_CODE_TTL_MS) return { ok: false, reason: "malformed" };
  if (payload.a !== action) return { ok: false, reason: "wrong_action" };

  const providedHash = Buffer.from(codeHash(normaliseActionCode(code)), "utf8");
  const expectedHash = Buffer.from(payload.c, "utf8");
  if (providedHash.length !== expectedHash.length || !timingSafeEqual(providedHash, expectedHash)) {
    return { ok: false, reason: "wrong_code" };
  }

  return { ok: true };
}

/** Mask an address for display: "ammar@gmail.com" -> "a***r@gmail.com". */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "your email";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? ""}***${domain}`;
  return `${local[0]}***${local[local.length - 1]}${domain}`;
}
