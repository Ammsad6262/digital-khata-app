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

/** GET with typed response. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
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
  const res = await fetch(path, {
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
  const res = await fetch(path, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return unwrap<T>(res, path);
}

/** Unwrap a fetch response into either data or an ApiError. */
async function unwrap<T>(res: Response, path: string): Promise<T> {
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
