/**
 * API response helpers.
 *
 * Every route handler in `src/app/api/*` should use these helpers so the
 * response shape is consistent across the app:
 *
 *   Success: { ok: true,  data: <T> }
 *   Error:   { ok: false, error: { code, message, details? } }
 *
 * The frontend's fetch wrapper (lib/utils/api-client.ts — to be added in
 * a later phase) can then rely on this shape.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, ErrorCode, ValidationError } from "@/lib/errors";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
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

/** Error response with proper status code based on the AppError subclass. */
export function fail(error: unknown): NextResponse<ApiError> {
  // Known application error
  if (error instanceof AppError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.statusCode },
    );
  }
  // Zod validation error
  if (error instanceof ZodError) {
    const validationError = new ValidationError(error.issues);
    return NextResponse.json(
      { ok: false, error: { code: validationError.code, message: validationError.message, details: validationError.details } },
      { status: validationError.statusCode },
    );
  }
  // Prisma known errors (P2002 = unique constraint, P2025 = not found)
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: string }).code;
    if (code === "P2002") {
      return NextResponse.json(
        { ok: false, error: { code: ErrorCode.CONFLICT, message: "A record with this value already exists." } },
        { status: 409 },
      );
    }
    if (code === "P2025") {
      return NextResponse.json(
        { ok: false, error: { code: ErrorCode.NOT_FOUND, message: "Record not found." } },
        { status: 404 },
      );
    }
  }
  // Unknown error — log it server-side, return generic 500.
  console.error("[api] Unhandled error:", error);
  return NextResponse.json(
    { ok: false, error: { code: ErrorCode.INTERNAL, message: "Internal server error." } },
    { status: 500 },
  );
}

/** Parse a JSON body safely. Returns null on parse failure. */
export async function parseJsonBody<T>(
  req: Request,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const text = await req.text();
    if (!text) return { data: null, error: null };
    return { data: JSON.parse(text) as T, error: null };
  } catch (e) {
    return { data: null, error: "Invalid JSON body." };
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
