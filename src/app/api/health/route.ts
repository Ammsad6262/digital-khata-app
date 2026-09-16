/**
 * GET /api/health
 *
 * Verifies the database is reachable and reports basic info.
 * Used by the test script and as a deployment probe.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    // A trivial query to verify the DB is reachable.
    const customerCount = await prisma.customer.count();
    const productCount = await prisma.product.count();

    return NextResponse.json({
      ok: true,
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
        counts: {
          customers: customerCount,
          products: productCount,
        },
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
