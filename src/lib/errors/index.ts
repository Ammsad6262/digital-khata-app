/**
 * Application error hierarchy.
 *
 * Every error thrown by the service layer or API routes should be an
 * `AppError` (or a subclass). The route handler's `fail()` helper inspects
 * the error class to decide the HTTP status code.
 *
 * Why custom errors instead of just throwing strings or Error?
 *   - Status code is part of the error, not a separate mapping.
 *   - Error code (machine-readable) lets the frontend show different UI
 *     for different failures (e.g. "validation" vs "conflict").
 *   - Details field carries structured info (which field failed Zod validation).
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

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL,
    statusCode: number = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** 400 — input didn't pass Zod validation. Details = the Zod issues. */
export class ValidationError extends AppError {
  constructor(details: unknown) {
    super("Validation failed.", ErrorCode.VALIDATION, 400, details);
    this.name = "ValidationError";
  }
}

/** 400 — input was structurally OK but logically wrong (e.g. paidAmount > totalAmount). */
export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, ErrorCode.BAD_REQUEST, 400, details);
    this.name = "BadRequestError";
  }
}

/** 404 — referenced entity (customer, product, sale, etc.) was not found. */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} not found: ${id}` : `${resource} not found.`,
      ErrorCode.NOT_FOUND,
      404,
    );
    this.name = "NotFoundError";
  }
}

/** 409 — unique constraint violation, e.g. phone already exists. */
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, ErrorCode.CONFLICT, 409, details);
    this.name = "ConflictError";
  }
}

/** 401 — no session, or PIN not set up. */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized.") {
    super(message, ErrorCode.UNAUTHORIZED, 401);
    this.name = "UnauthorizedError";
  }
}
