/**
 * Application error hierarchy.
 *
 * Every error thrown by the service layer or API routes should be an
 * `AppError` (or a subclass). The route handler's `fail()` helper inspects
 * the error class to decide the HTTP status code.
 *
 * V13 (Urdu i18n): Error classes accept either an English message OR a
 * translation key (e.g. "api.sale.notFound") + optional params for placeholder
 * substitution. The `fail()` helper in `lib/utils/api.ts` resolves the key
 * to English text using `tServer()`. The frontend's toast.error() then
 * re-translates to Urdu via `t(error.message)` if it looks like a translation
 * key (the toast provider automatically calls `t()` on the message).
 *
 * Why custom errors instead of just throwing strings or Error?
 *   - Status code is part of the error, not a separate mapping.
 *   - Error code (machine-readable) lets the frontend show different UI
 *     for different failures (e.g. "validation" vs "conflict").
 *   - Details field carries structured info (which field failed Zod validation).
 *   - params field carries interpolation values for translation keys.
 */

export const ErrorCode = {
  VALIDATION: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  BAD_REQUEST: "BAD_REQUEST",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  /** Translation params (used when `message` is a translation key). */
  readonly params?: Record<string, string | number>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL,
    statusCode: number = 500,
    details?: unknown,
    params?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.params = params;
  }
}

/** 400 — input didn't pass Zod validation. Details = the Zod issues. */
export class ValidationError extends AppError {
  constructor(details: unknown) {
    super("api.errors.validationFailed", ErrorCode.VALIDATION, 400, details);
    this.name = "ValidationError";
  }
}

/** 400 — input was structurally OK but logically wrong (e.g. paidAmount > totalAmount). */
export class BadRequestError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    params?: Record<string, string | number>,
  ) {
    super(message, ErrorCode.BAD_REQUEST, 400, details, params);
    this.name = "BadRequestError";
  }
}

/**
 * 404 — referenced entity (customer, product, sale, etc.) was not found.
 *
 * @param resource - either a raw English string ("Customer") OR a translation
 *                   key ("api.resource.customer").
 * @param id - optional ID of the missing resource.
 *
 * If `resource` looks like a translation key, the message will be the key
 * "api.errors.notFoundWithId" (if id present) or "api.errors.notFound",
 * with `{resource}` and `{id}` placeholders resolved to the resource's
 * translated name.
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    // If resource looks like a translation key, compose message using
    // the not-found template keys.
    const isKey = resource.includes(".") && !/\s/.test(resource);
    if (isKey) {
      if (id) {
        super(
          "api.errors.notFoundWithId",
          ErrorCode.NOT_FOUND,
          404,
          undefined,
          { resource, id },
        );
      } else {
        super("api.errors.notFound", ErrorCode.NOT_FOUND, 404, undefined, {
          resource,
        });
      }
    } else {
      // Legacy: raw English resource name.
      super(
        id ? `${resource} not found: ${id}` : `${resource} not found.`,
        ErrorCode.NOT_FOUND,
        404,
      );
    }
    this.name = "NotFoundError";
  }
}

/** 409 — unique constraint violation, e.g. phone already exists. */
export class ConflictError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    params?: Record<string, string | number>,
  ) {
    super(message, ErrorCode.CONFLICT, 409, details, params);
    this.name = "ConflictError";
  }
}

/** 401 — no session, or PIN not set up. */
export class UnauthorizedError extends AppError {
  constructor(message: string = "api.errors.unauthorized") {
    super(message, ErrorCode.UNAUTHORIZED, 401);
    this.name = "UnauthorizedError";
  }
}

/** 403 — authenticated but not allowed (e.g. subscription expired). */
export class ForbiddenError extends AppError {
  constructor(message: string = "api.errors.forbidden") {
    super(message, ErrorCode.UNAUTHORIZED, 403);
    this.name = "ForbiddenError";
  }
}
