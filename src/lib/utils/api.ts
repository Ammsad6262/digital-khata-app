/**
 * API response helpers.
 *
 * Every route handler in `src/app/api/*` should use these helpers so the
 * response shape is consistent across the app:
 *
 *   Success: { ok: true,  data: <T> }
 *   Error:   { ok: false, error: { code, message, details? } }
 *
 * V13 (Urdu i18n):
 *   - Error messages may be translation keys (e.g. "api.sale.notFound").
 *     The `fail()` helper resolves them to English via `tServer()`.
 *   - The frontend's toast provider re-translates via `t()` if the message
 *     looks like a translation key.
 *   - `params` field on AppError carries interpolation values for templates.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, ErrorCode, ValidationError } from "@/lib/errors";
import { tServer } from "@/lib/i18n/server";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    /** True if `message` is a translation key the frontend can re-translate. */
    translationKey?: boolean;
    /** Translation params for placeholder substitution. */
    params?: Record<string, string | number>;
    details?: unknown;
  };
}

/** 200 OK with data. */
export function ok<T>(data: T, status: number = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

/** 201 Created with data. */
export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

/**
 * Resolve an error's message: if it looks like a translation key, return the
 * key as-is (frontend will re-translate to Urdu). Otherwise, fall back to the
 * English string. Also return params if present.
 */
function resolveError(error: AppError): {
  message: string;
  translationKey: boolean;
  params?: Record<string, string | number>;
} {
  const message = error.message || "";
  const looksLikeKey = message.includes(".") && !/\s/.test(message);
  if (looksLikeKey) {
    // Resolve to English (server-side). The frontend will re-translate to Urdu.
    const english = tServer(message as never, error.params, "en");
    return { message: english, translationKey: true, params: error.params };
  }
  // Plain English message (legacy or dynamic).
  return { message, translationKey: false };
}

/** Error response with proper status code based on the AppError subclass. */
export function fail(error: unknown): NextResponse<ApiError> {
  // Known application error
  if (error instanceof AppError) {
    const { message, translationKey, params } = resolveError(error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message,
          translationKey,
          params,
          details: error.details,
        },
      },
      { status: error.statusCode },
    );
  }
  // Zod validation error
  if (error instanceof ZodError) {
    const validationError = new ValidationError(error.issues);
    const { message, translationKey, params } = resolveError(validationError);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: validationError.code,
          message,
          translationKey,
          params,
          details: validationError.details,
        },
      },
      { status: validationError.statusCode },
    );
  }
  // Prisma known errors (P2002 = unique constraint, P2025 = not found)
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: string }).code;
    if (code === "P2002") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: ErrorCode.CONFLICT,
            message: tServer("api.errors.conflict"),
            translationKey: true,
          },
        },
        { status: 409 },
      );
    }
    if (code === "P2025") {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: ErrorCode.NOT_FOUND,
            message: tServer("api.errors.recordNotFound"),
            translationKey: true,
          },
        },
        { status: 404 },
      );
    }
  }
  // Unknown error — log it server-side, return generic 500.
  console.error("[api] Unhandled error:", error);
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: ErrorCode.INTERNAL,
        message: tServer("api.errors.internal"),
        translationKey: true,
      },
    },
    { status: 500 },
  );
}

/** Maximum request body size (1 MB). Prevents DoS via huge payloads. */
const MAX_BODY_SIZE = 1024 * 1024;

/** Parse a JSON body safely. Returns null on parse failure. Rejects bodies > 1MB. */
export async function parseJsonBody<T>(
  req: Request,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const text = await req.text();
    if (!text) return { data: null, error: null };
    if (text.length > MAX_BODY_SIZE) {
      return {
        data: null,
        error: tServer("api.errors.bodyTooLarge", {
          max: String(MAX_BODY_SIZE / 1024),
        }),
      };
    }
    return { data: JSON.parse(text) as T, error: null };
  } catch {
    return { data: null, error: tServer("api.errors.invalidJson") };
  }
}

/** Extract a search param as a string, with fallback. */
export function getQueryParam(
  req: Request,
  key: string,
  fallback?: string,
): string | undefined {
  const url = new URL(req.url);
  const value = url.searchParams.get(key);
  return value ?? fallback;
}

/** Extract a search param as an integer. */
export function getIntQueryParam(
  req: Request,
  key: string,
  fallback?: number,
): number | undefined {
  const value = getQueryParam(req, key);
  if (value === undefined || value === "") return fallback;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
