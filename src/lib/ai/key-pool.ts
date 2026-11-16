/**
 * Which Gemini API key pool a request may spend from.
 *
 * Two separate keys, one shared model rotation:
 *
 *   user  — `GEMINI_API_KEY`. Every paying/trialling customer (PREMIUM and the
 *           14-day TRIAL) draws from this key, so its quota is "the money".
 *   owner — `GEMINI_OWNER_API_KEY`. OWNER and AFFILIATE accounts (the people who
 *           test the product and never pay for it) draw from this key, so their
 *           usage can never exhaust a customer's budget.
 *
 * The pool is chosen server-side from the entitlement category, never from
 * client input. It travels with the request through AsyncLocalStorage, set once
 * in `requireAiAccess`, so the low-level client and the usage counters do not
 * need the user threaded through every signature.
 *
 * Safety: if `GEMINI_OWNER_API_KEY` is missing, owners fall back to the user key
 * so the owner experience never breaks; the log makes that visible.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type AiKeyPool = "owner" | "user";

const storage = new AsyncLocalStorage<AiKeyPool>();

/** OWNER and AFFILIATE spend the owner key; everyone else spends the user key. */
export function poolForCategory(category: string): AiKeyPool {
  return category === "OWNER" || category === "AFFILIATE" ? "owner" : "user";
}

/**
 * Bind the pool to the rest of the current request's async context.
 * Called once per AI request, right after the entitlement is resolved.
 */
export function setAiKeyPool(pool: AiKeyPool): void {
  storage.enterWith(pool);
}

/** The pool for the current request. Defaults to the customer key. */
export function currentAiKeyPool(): AiKeyPool {
  return storage.getStore() ?? "user";
}

/** Resolve the actual API key for a pool, with the safe fallback. */
export function apiKeyForPool(pool: AiKeyPool): string | undefined {
  if (pool === "owner") {
    return process.env.GEMINI_OWNER_API_KEY || process.env.GEMINI_API_KEY;
  }
  return process.env.GEMINI_API_KEY;
}

/**
 * True when the owner pool is a *dedicated* key rather than the fallback.
 * Used by the admin diagnostics page and by logging.
 */
export function hasDedicatedOwnerKey(): boolean {
  return Boolean(process.env.GEMINI_OWNER_API_KEY);
}

/** Which keys are configured — booleans only, never the values. */
export function aiKeyStatus(): { user: boolean; owner: boolean; ownerDedicated: boolean } {
  return {
    user: Boolean(process.env.GEMINI_API_KEY),
    owner: Boolean(apiKeyForPool("owner")),
    ownerDedicated: hasDedicatedOwnerKey(),
  };
}

/**
 * Storage key for a model's daily usage row. Pool-prefixed so the owner's
 * testing cannot consume a customer's daily budget, even though both pools run
 * the same three-model rotation.
 */
export function usageKeyFor(pool: AiKeyPool, model: string): string {
  return `${pool}::${model}`;
}
