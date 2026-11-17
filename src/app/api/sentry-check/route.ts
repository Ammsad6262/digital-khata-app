import { NextResponse } from "next/server";

/**
 * Temporary Sentry verification route. Throws on purpose so the server-side
 * instrumentation (`onRequestError`) is exercised. Removed immediately after the
 * check; it must not ship.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  throw new Error("Dukhata server Sentry check — safe to ignore");
}