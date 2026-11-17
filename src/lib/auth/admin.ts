/**
 * Admin request authentication.
 *
 * The admin pages/APIs are protected by a long `ADMIN_SECRET` header, not by a
 * user account. This is separate from the owner's normal login so activation
 * codes and password-reset codes can be issued even when the owner is locked
 * out of their account.
 *
 * Hardening notes (from the licensing security review):
 *   - The secret is compared in constant time AND both sides are hashed first,
 *     so the comparison never leaks the secret's length through timing.
 *   - Guessing is rate-limited per IP exactly like account login. Without this,
 *     the header could be brute-forced at full speed, and a successful guess
 *     carries full admin authority (mint codes, grant owners, read every user).
 *   - Fails closed: a missing or short secret rejects every admin request.
 */

import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { AppError, ErrorCode, UnauthorizedError } from "@/lib/errors";
import { checkRateLimit, getClientIp, recordFailure, recordSuccess } from "./rate-limiter";

const MIN_SECRET_LENGTH = 16;

function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  return secret;
}

/** Fixed-length digest, so equal-length comparison cannot leak secret length. */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** True only when the request carries the exact configured admin secret. */
export function isAdminRequest(req: NextRequest): boolean {
  const secret = getAdminSecret();
  if (!secret) return false;

  const provided = req.headers.get("x-admin-secret");
  if (!provided) return false;

  return timingSafeEqual(digest(provided), digest(secret));
}

/** Throw the standard 401 response when the admin secret is missing/wrong. */
export function requireAdmin(req: NextRequest): void {
  const rateKey = `admin:${getClientIp(req)}`;

  const { locked, retryAfter } = checkRateLimit(rateKey);
  if (locked) {
    throw new AppError("api.admin.rateLimited", ErrorCode.BAD_REQUEST, 429, undefined, {
      seconds: retryAfter,
    });
  }

  if (!isAdminRequest(req)) {
    recordFailure(rateKey);
    throw new UnauthorizedError("api.admin.unauthorized");
  }

  recordSuccess(rateKey);
}