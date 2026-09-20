/**
 * GET /api/health
 *
 * Verifies the database is reachable. Returns ONLY "connected" status —
 * does NOT leak record counts or business data (info disclosure prevention).
 *
 * This route is PUBLIC (no session required) — it's used as a deployment probe.
 *
 * Uses circuit breaker: if DB is unreachable, fast-fails with 503 instead of
 * hanging for 10s (Vercel's default function timeout).
 */

import { NextResponse } from "next/server";
import { withCircuitBreaker, getCircuitBreakerState } from "@/lib/utils/circuit-breaker";
import { rawPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const cbState = getCircuitBreakerState();

  // If circuit breaker is open, fast-fail immediately
  if (cbState.state === "open") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DATABASE_ERROR",
          message: "Database circuit breaker is open. Please retry in a few seconds.",
        },
      },
      { status: 503 },
    );
  }

  try {
    // Trivial query with circuit breaker + 5s timeout
    const result = await withCircuitBreaker(
      () => rawPrisma.customer.count(),
      -1, // fallback: -1 means "DB unreachable"
      5000,
    );

    if (result === -1) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "DATABASE_ERROR",
            message: "Database connection failed.",
          },
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        status: "healthy",
        database: "connected",
      },
    });
  } catch (error) {
    console.error("[health] DB connection failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "DATABASE_ERROR",
          message: "Database connection failed.",
        },
      },
      { status: 503 },
    );
  }
}
