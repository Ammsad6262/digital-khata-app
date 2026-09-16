/**
 * Owner PIN auth helpers.
 *
 * V1 uses a single-owner PIN gate (no full auth system, no customer login).
 * The PIN is hashed with bcrypt and stored in Setting.ownerPinHash.
 *
 * NOTE: For Phase 3 we only ship the hashing/verification primitives — the
 * actual PIN unlock UI / cookie session will be implemented in a later phase.
 */

import bcrypt from "bcryptjs";

const DEFAULT_ROUNDS = 10;

function getRounds(): number {
  const raw = process.env.BCRYPT_ROUNDS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_ROUNDS;
  return Number.isFinite(parsed) && parsed >= 4 && parsed <= 31
    ? parsed
    : DEFAULT_ROUNDS;
}

/** Hash a plaintext PIN (4-6 digits expected, but we don't enforce length here). */
export async function hashPin(plaintext: string): Promise<string> {
  if (!plaintext || plaintext.length < 4) {
    throw new Error("PIN must be at least 4 characters.");
  }
  return bcrypt.hash(plaintext, getRounds());
}

/** Verify a plaintext PIN against a stored bcrypt hash. */
export async function verifyPin(plaintext: string, hash: string): Promise<boolean> {
  if (!plaintext || !hash) return false;
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

/**
 * Validate PIN format (digits only, 4-6 chars).
 * Used by the API before hashing.
 */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}
