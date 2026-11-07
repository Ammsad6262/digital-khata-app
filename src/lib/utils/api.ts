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
import { AppError, BadRequestError, ErrorCode, ValidationError } from "@/lib/errors";
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
    /**
     * The original translation key, when the message came from one. `message`
     * is the English text (already interpolated for plain-English consumers);
     * this lets the client re-translate parameterised messages to Urdu.
     */
    messageKey?: string;
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
  messageKey?: string;
} {
  const message = error.message || "";
  const looksLikeKey = message.includes(".") && !/\s/.test(message);
  if (looksLikeKey) {
    // Resolve to English (server-side) for any consumer that reads
    // `message` directly, but also send the key so the client can
    // re-translate parameterised messages correctly.
    const english = tServer(message as never, error.params, "en");
    return {
      message: english,
      translationKey: true,
      params: error.params,
      messageKey: message,
    };
  }
  // Plain English message (legacy or dynamic).
  return { message, translationKey: false };
}

/** Error response with proper status code based on the AppError subclass. */
export function fail(error: unknown): NextResponse<ApiError> {
  // Known application error
  if (error instanceof AppError) {
    const { message, translationKey, params, messageKey } = resolveError(error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message,
          translationKey,
          params,
          messageKey,
          details: error.details,
        },
      },
      { status: error.statusCode },
    );
  }
  // Zod validation error
  if (error instanceof ZodError) {
    const validationError = new ValidationError(error.issues);
    const { message, translationKey, params, messageKey } = resolveError(validationError);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: validationError.code,
          message,
          translationKey,
          params,
          messageKey,
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
            messageKey: "api.errors.conflict",
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
            messageKey: "api.errors.recordNotFound",
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
        messageKey: "api.errors.internal",
      },
    },
    { status: 500 },
  );
}

/** Maximum request body size (1 MB). Prevents DoS via huge payloads. */
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * Parse a JSON body safely.
 *
 * An empty body returns `{ data: null, error: null }` so callers can apply
 * their own "body required" rule. A malformed or oversized body throws a
 * BadRequestError (400) — every route handler runs inside a try/catch, so it
 * is reported as a client error instead of leaking out as a 500.
 */
export async function parseJsonBody<T>(
  req: Request,
): Promise<{ data: T | null; error: string | null }> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new BadRequestError("api.errors.invalidJson");
  }
  if (!text) return { data: null, error: null };
  if (text.length > MAX_BODY_SIZE) {
    throw new BadRequestError("api.errors.bodyTooLarge", undefined, {
      max: String(MAX_BODY_SIZE / 1024),
    });
  }
  try {
    return { data: JSON.parse(text) as T, error: null };
  } catch {
    throw new BadRequestError("api.errors.invalidJson");
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
