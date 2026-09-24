/**
 * API client — typed fetch wrapper for the frontend.
 *
 * Every response from our API follows the shape:
 *   Success: { ok: true,  data: T }
 *   Error:   { ok: false, error: { code, message, details? } }
 *
 * This wrapper unwraps `data` on success and throws an `ApiError` on failure
 * so React Query's `error` state receives it cleanly.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Client-side request timeout (15 seconds). Prevents hanging if the server
 *  is slow/unreachable. The circuit breaker on the server side handles DB
 *  timeouts, but network latency between browser ↔ Vercel needs this. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Fetch wrapper with AbortController timeout. */
async function fetchWithTimeout(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(path, {
      ...options,
      credentials: "same-origin",
      signal: controller.signal,
    });
    return res;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(
        `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Please retry.`,
        "TIMEOUT",
        408,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** GET with typed response. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(path, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  return unwrap<T>(res, path);
}

/** POST with typed response. */
export async function apiPost<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetchWithTimeout(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return unwrap<T>(res, path);
}

/** PATCH with typed response. */
export async function apiPatch<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetchWithTimeout(path, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return unwrap<T>(res, path);
}

/** DELETE with typed response (sends a body for confirmation fields). */
export async function apiDelete<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetchWithTimeout(path, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return unwrap<T>(res, path);
}

/** Unwrap a fetch response into either data or an ApiError. */
async function unwrap<T>(res: Response, path: string): Promise<T> {
  // Handle 401 — session expired or not authenticated.
  if (res.status === 401) {
    // For auth routes, throw normally (handled by caller)
    // For non-auth routes, redirect to login
    if (!path.startsWith("/api/auth/")) {
      // Check if we're in the browser (not SSR)
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    throw new ApiError("Please log in to continue.", "UNAUTHORIZED", 401);
  }

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(
      `Failed to parse response from ${path}`,
      "PARSE_ERROR",
      res.status,
    );
  }

  if (json.ok) {
    return json.data;
  }

  throw new ApiError(
    json.error.message,
    json.error.code,
    res.status,
    json.error.details,
  );
}
