/**
 * In-memory rate limiter for auth endpoints.
 *
 * Tracks failed PIN attempts per IP address. After MAX_FAILURES failures
 * within the WINDOW, the IP is locked out for LOCKOUT_DURATION.
 *
 * Note: in-memory means it resets on server restart. For V1 with a single
 * server process, this is acceptable. For multi-server deployment, use
 * Redis or a database-backed rate limiter.
 *
 * Config:
 *   MAX_FAILURES = 5 attempts
 *   WINDOW = 5 minutes (300s)
 *   LOCKOUT_DURATION = 5 minutes (300s)
 */

type AttemptRecord = {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
};

const MAX_FAILURES = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

// Map<IP, AttemptRecord>
const store = new Map<string, AttemptRecord>();

// Cleanup old entries every 10 minutes to prevent memory leak
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 10 * 60 * 1000) return;
  lastCleanup = now;
  for (const [ip, record] of store.entries()) {
    if (now - record.firstFailureAt > WINDOW_MS && now > record.lockedUntil) {
      store.delete(ip);
    }
  }
}

/**
 * Check if an IP is currently locked out.
 * Returns { locked: boolean, retryAfter: number (seconds) }
 */
export function checkRateLimit(ip: string): { locked: boolean; retryAfter: number } {
  cleanup();
  const record = store.get(ip);
  if (!record) return { locked: false, retryAfter: 0 };

  const now = Date.now();
  if (record.lockedUntil > now) {
    return {
      locked: true,
      retryAfter: Math.ceil((record.lockedUntil - now) / 1000),
    };
  }

  // Lockout expired — reset
  if (record.lockedUntil > 0 && now >= record.lockedUntil) {
    store.delete(ip);
    return { locked: false, retryAfter: 0 };
  }

  return { locked: false, retryAfter: 0 };
}

/** Record a failed attempt. May trigger lockout. */
export function recordFailure(ip: string): void {
  cleanup();
  const now = Date.now();
  let record = store.get(ip);

  if (!record) {
    record = { failures: 0, firstFailureAt: now, lockedUntil: 0 };
    store.set(ip, record);
  }

  // Reset if window expired
  if (now - record.firstFailureAt > WINDOW_MS) {
    record.failures = 0;
    record.firstFailureAt = now;
  }

  record.failures++;

  if (record.failures >= MAX_FAILURES) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
}

/** Record a successful attempt — clears the failure history for this IP. */
export function recordSuccess(ip: string): void {
  store.delete(ip);
}

/** Get the client IP from a Next.js request. Falls back to "unknown". */
export function getClientIp(req: Request): string {
  // Standard headers (in order of trust for common proxies)
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can be "client, proxy1, proxy2" — take the first
    return forwarded.split(",")[0]!.trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
