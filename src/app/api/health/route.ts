/**
 * GET /api/health
 *
 * Verifies the database is reachable. Returns ONLY "connected" status —
 * does NOT leak record counts or business data (info disclosure prevention).
 *
 * This route is PUBLIC (no session required) — it's used as a deployment probe.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    // A trivial query to verify the DB is reachable.
    // We intentionally don't return record counts — that's business data.
    await prisma.customer.count();

    return NextResponse.json({
      ok: true,
      data: {
        status: "healthy",
        database: "connected",
      },
    });
  } catch (error) {
    // Log the full error server-side, but don't leak details to the client
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
