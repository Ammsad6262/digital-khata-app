/**
 * Rate limiter for Smart Khata Entry endpoints.
 *
 * Per-user limits (identified by userId, not IP — IP-based would be too
 * coarse for users behind NAT):
 *   - 20 interpretations per hour (cost protection — Gemini calls cost $)
 *   - 60 executions per hour (executions are cheap but still want to cap)
 *
 * In-memory only (resets on server restart). For multi-server deployments,
 * use Redis. For V1 with Vercel serverless, this is acceptable — each
 * function instance has its own map, but cold starts + identity rotation
 * keep this approximate, which is fine for cost protection (not security).
 */

const MAX_INTERPRET_PER_HOUR = 20;
const MAX_EXECUTE_PER_HOUR = 60;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

type Bucket = { count: number; firstAt: number };

const interpretBuckets = new Map<string, Bucket>();
const executeBuckets = new Map<string, Bucket>();

// Periodic cleanup (every 10 min) to prevent memory leak
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 10 * 60 * 1000) return;
  lastCleanup = now;
  for (const [key, bucket] of interpretBuckets.entries()) {
    if (now - bucket.firstAt > WINDOW_MS) interpretBuckets.delete(key);
  }
  for (const [key, bucket] of executeBuckets.entries()) {
    if (now - bucket.firstAt > WINDOW_MS) executeBuckets.delete(key);
  }
}

/** Returns true if the user is allowed to interpret, false if rate-limited. */
export function checkInterpretLimit(userId: string): { allowed: boolean; retryAfterSec: number } {
  cleanup();
  const now = Date.now();
  let bucket = interpretBuckets.get(userId);
  if (!bucket) {
    bucket = { count: 0, firstAt: now };
    interpretBuckets.set(userId, bucket);
  }
  // Reset window if expired
  if (now - bucket.firstAt > WINDOW_MS) {
    bucket.count = 0;
    bucket.firstAt = now;
  }
  if (bucket.count >= MAX_INTERPRET_PER_HOUR) {
    const retryAfterSec = Math.ceil((bucket.firstAt + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSec };
  }
  bucket.count++;
  return { allowed: true, retryAfterSec: 0 };
}

/** Returns true if the user is allowed to execute, false if rate-limited. */
export function checkExecuteLimit(userId: string): { allowed: boolean; retryAfterSec: number } {
  cleanup();
  const now = Date.now();
  let bucket = executeBuckets.get(userId);
  if (!bucket) {
    bucket = { count: 0, firstAt: now };
    executeBuckets.set(userId, bucket);
  }
  if (now - bucket.firstAt > WINDOW_MS) {
    bucket.count = 0;
    bucket.firstAt = now;
  }
  if (bucket.count >= MAX_EXECUTE_PER_HOUR) {
    const retryAfterSec = Math.ceil((bucket.firstAt + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSec };
  }
  bucket.count++;
  return { allowed: true, retryAfterSec: 0 };
}
