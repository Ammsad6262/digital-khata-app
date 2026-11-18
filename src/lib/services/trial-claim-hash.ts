/**
 * Pure helpers for trial claims — no database, no imports beyond `crypto`.
 *
 * Kept separate so scripts and tests can hash an address without pulling in the
 * Prisma client (and so the rule itself has one definition, not two copies).
 */

import { createHash } from "crypto";

/** Domains where dots and `+tags` in the local part are ignored by the provider. */
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * The address as it should be judged for a trial.
 *
 * Gmail treats `a.b+trial2@gmail.com`, `ab@gmail.com` and `ab@googlemail.com`
 * as one mailbox. Without folding them together a trial could be farmed
 * endlessly without ever deleting an account — so this closes the cheaper hole
 * as well as the delete-and-reregister one. Every other provider is left alone,
 * because there dots and tags really do identify different mailboxes.
 */
export function normalizeEmailForTrial(email: string): string {
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf("@");
  if (at < 1) return normalised;

  const local = normalised.slice(0, at);
  const domain = normalised.slice(at + 1);
  if (!GMAIL_DOMAINS.has(domain)) return normalised;

  const withoutTag = local.split("+", 1)[0] ?? "";
  return `${withoutTag.replace(/\./g, "")}@gmail.com`;
}

/**
 * Stable, non-reversible key for one mailbox.
 *
 * The hash is unsalted on purpose: it must stay stable for the life of the
 * database. A pepper would make this protection quietly disappear the first
 * time a secret was rotated — a much worse failure than a leaked table of
 * email hashes, which reveals nothing the `User` table does not already hold.
 */
export function hashTrialEmail(email: string): string {
  return createHash("sha256")
    .update(`trial:${normalizeEmailForTrial(email)}`)
    .digest("hex");
}
