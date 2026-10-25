/**
 * Admin request authentication.
 *
 * The admin pages/APIs are protected by a long `ADMIN_SECRET` header, not by a
 * user account. This is separate from the owner's normal login so activation
 * codes and password-reset codes can be issued even when the owner is locked
 * out of their account.
 *
 * The secret is compared in constant time and must be at least 16 characters.
 * If it is missing or too short, every admin request is rejected.
 */

import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { UnauthorizedError } from "@/lib/errors";

function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 16) return null;
  return secret;
}

/** True only when the request carries the exact configured admin secret. */
export function isAdminRequest(req: NextRequest): boolean {
  const secret = getAdminSecret();
  if (!secret) return false;

  const provided = req.headers.get("x-admin-secret");
  if (!provided) return false;

  const providedBytes = Buffer.from(provided, "utf8");
  const secretBytes = Buffer.from(secret, "utf8");
  if (providedBytes.length !== secretBytes.length) return false;

  return timingSafeEqual(providedBytes, secretBytes);
}

/** Throw the standard 401 response when the admin secret is missing/wrong. */
export function requireAdmin(req: NextRequest): void {
  if (!isAdminRequest(req)) {
    throw new UnauthorizedError("api.admin.unauthorized");
  }
}
