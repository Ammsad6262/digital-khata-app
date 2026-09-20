/**
 * Circuit Breaker — protects the app from cascading failures when the
 * database (Supabase Postgres) is slow or unreachable.
 *
 * States:
 *   - CLOSED:    Normal operation. Requests pass through.
 *   - OPEN:      Database is failing. All requests fast-fail immediately
 *                with a fallback response. No DB calls are made.
 *   - HALF_OPEN: After a cooldown period, one request is allowed through
 *                to test if the DB has recovered. If it succeeds → CLOSED.
 *                If it fails → back to OPEN.
 *
 * Configuration:
 *   - FAILURE_THRESHOLD: 5 consecutive failures → trip to OPEN
 *   - TIMEOUT_MS: 8 seconds — if a DB call takes longer, count as failure
 *   - COOLDOWN_MS: 30 seconds — wait before trying HALF_OPEN
 *   - RESET_TIMEOUT_MS: 60 seconds — force reset even if no requests
 *
 * Usage:
 *   import { withCircuitBreaker } from "@/lib/utils/circuit-breaker";
 *
 *   const result = await withCircuitBreaker(
 *     () => prisma.customer.findMany(),
 *     () => []  // fallback
 *   );
 */

type CircuitState = "closed" | "open" | "half-open";

const FAILURE_THRESHOLD = 5;
const TIMEOUT_MS = 8000;
const COOLDOWN_MS = 30_000;

let state: CircuitState = "closed";
let failureCount = 0;
let lastFailureTime = 0;
let lastStateChange = Date.now();

type CircuitBreakerState = {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number | null;
};

/** Get current circuit breaker state (for monitoring/debugging). */
export function getCircuitBreakerState(): CircuitBreakerState {
  // Auto-attempt half-open after cooldown
  if (state === "open" && Date.now() - lastStateChange > COOLDOWN_MS) {
    state = "half-open";
    lastStateChange = Date.now();
  }

  return {
    state,
    failureCount,
    lastFailureAt: lastFailureTime > 0 ? lastFailureTime : null,
  };
}

/** Reset the circuit breaker (for testing or manual recovery). */
export function resetCircuitBreaker(): void {
  state = "closed";
  failureCount = 0;
  lastFailureTime = 0;
  lastStateChange = Date.now();
}

/**
 * Execute a function with circuit breaker protection.
 *
 * If the circuit is OPEN, returns the fallback immediately (no DB call).
 * If the circuit is CLOSED/HALF-OPEN, executes the function with a timeout.
 * On success → resets failure count. On failure → increments and may trip.
 *
 * @param fn The async function to execute (e.g., a Prisma query)
 * @param fallback The value to return if the circuit is open or the call fails
 * @param timeoutMs Optional custom timeout (default 8s)
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs: number = TIMEOUT_MS,
): Promise<T> {
  // Check if circuit is open
  const currentState = getCircuitBreakerState();

  if (currentState.state === "open") {
    // Fast-fail — don't even try the DB call
    return fallback;
  }

  try {
    // Execute with timeout
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Circuit breaker timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);

    // Success — reset
    if (currentState.state === "half-open") {
      state = "closed";
      lastStateChange = Date.now();
    }
    failureCount = 0;
    return result as T;
  } catch (error) {
    // Failure
    failureCount++;
    lastFailureTime = Date.now();

    if (currentState.state === "half-open") {
      // Half-open failure → back to open
      state = "open";
      lastStateChange = Date.now();
    } else if (failureCount >= FAILURE_THRESHOLD) {
      // Threshold reached → trip to open
      state = "open";
      lastStateChange = Date.now();
      console.error(
        `[circuit-breaker] Tripped to OPEN after ${failureCount} failures. ` +
          `Last error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return fallback;
  }
}

/**
 * Execute a Prisma operation with circuit breaker protection.
 * Throws on failure (use withCircuitBreaker for a fallback version).
 *
 * If the circuit is OPEN, throws a "Database unavailable" error immediately.
 * This is for routes where we can't return a fallback (e.g., mutations).
 */
export async function withDbProtection<T>(
  fn: () => Promise<T>,
  timeoutMs: number = TIMEOUT_MS,
): Promise<T> {
  const currentState = getCircuitBreakerState();

  if (currentState.state === "open") {
    throw new Error(
      "Database is temporarily unavailable. The circuit breaker is open — " +
        "please try again in a few seconds.",
    );
  }

  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Database timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);

    if (currentState.state === "half-open") {
      state = "closed";
      lastStateChange = Date.now();
    }
    failureCount = 0;
    return result as T;
  } catch (error) {
    failureCount++;
    lastFailureTime = Date.now();

    if (currentState.state === "half-open") {
      state = "open";
      lastStateChange = Date.now();
    } else if (failureCount >= FAILURE_THRESHOLD) {
      state = "open";
      lastStateChange = Date.now();
      console.error(
        `[circuit-breaker] Tripped to OPEN after ${failureCount} failures. ` +
          `Last error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    throw error;
  }
}
