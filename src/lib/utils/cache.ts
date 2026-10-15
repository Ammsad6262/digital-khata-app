/**
 * Simple in-memory cache for API responses.
 *
 * Why: Supabase is in Mumbai, Vercel is in US-East. Every DB query has
 * ~300-500ms latency. For list pages (customers, products, sales), the
 * data doesn't change every second — a 10-30 second cache makes
 * subsequent page loads instant without hitting the DB.
 *
 * React Query handles CLIENT-side caching (per browser tab).
 * This cache handles SERVER-side caching (across all requests),
 * so the DB is only hit once per TTL period.
 *
 * Invalidation: call invalidateCache() from mutations (createSale,
 * recordPayment, addStock, etc.) to clear the cache so the next
 * read sees fresh data.
 *
 * SPECIAL CASE: invalidateCache("dashboard") also clears the dashboard
 * service's own in-memory cache (src/lib/services/dashboard.ts →
 * dashboardCache Map), which is separate from this shared cache.
 * This ensures the dashboard reflects new sales/payments immediately
 * after a mutation, not after the dashboard's 5s TTL expires.
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 10_000; // 10 seconds

/** Get a cached value, or null if expired/not found. */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

/** Set a cached value with a TTL (default 10s). */
export function setCached<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/** Get cached value or compute it (with caching). */
export async function cached<T>(
  key: string,
  compute: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== null) return hit;

  const data = await compute();
  setCached(key, data, ttlMs);
  return data;
}

/** Invalidate a specific cache key (or all keys matching a prefix). */
export function invalidateCache(keyOrPrefix: string): void {
  // Exact match
  cache.delete(keyOrPrefix);

  // Prefix match (e.g., "customers" invalidates "customers:list", "customers:search:ahmed")
  for (const k of cache.keys()) {
    if (k.startsWith(keyOrPrefix)) {
      cache.delete(k);
    }
  }

  // Note: dashboard cache clearing is handled separately by the dashboard
  // service's own clearDashboardCache() function, which is called directly
  // by mutation services (sales, payments, expenses, etc.) alongside
  // invalidateCache("dashboard"). This avoids a circular import between
  // cache.ts and dashboard.ts.
}

/** Invalidate ALL cache entries (used after major mutations). */
export function invalidateAllCache(): void {
  cache.clear();
}
