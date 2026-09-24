/**
 * GET /api/backup/csv/[table]
 *
 * Streams one table as a CSV file download.
 *
 * PERFORMANCE: Uses a ReadableStream to incrementally write CSV rows
 * instead of building the entire CSV string in memory. This avoids
 * Vercel's function timeout on large tables and reduces peak memory.
 *
 * Supported tables: customers, products, sales, saleItems, payments,
 * stockMoves, expenses, transactions
 *
 * NOTE: In Next.js 16, `params` is a Promise that must be awaited.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  fetchTableRows,
  rowsToCsv,
  EXPORTABLE_TABLES,
  type ExportableTable,
} from "@/lib/services/backup";
import { withCircuitBreaker } from "@/lib/utils/circuit-breaker";
import { getCurrentUserId } from "@/lib/auth/get-current-user";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const VALID_TABLES = new Set<string>(EXPORTABLE_TABLES.map((t) => t.value));

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  try {
    const { table } = await params;
    const userId = await getCurrentUserId(req);

    if (!VALID_TABLES.has(table)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "BAD_REQUEST",
            message: `Unknown table '${table}'. Valid: ${[...VALID_TABLES].join(", ")}.`,
          },
        },
        { status: 400 },
      );
    }

    // Fetch rows with circuit breaker protection
    const rows = await withCircuitBreaker(
      () => fetchTableRows(table as ExportableTable, userId),
      [],
      15000,
    );

    if (rows.length === 0) {
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `${table}-${dateStr}.csv`;
      return new NextResponse("\uFEFF", {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Stream the CSV
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${table}-${dateStr}.csv`;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // BOM for Excel
        controller.enqueue(encoder.encode("\uFEFF"));

        // Stream rows in chunks to avoid building one giant string
        const CHUNK_SIZE = 100;
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          const csv = rowsToCsv(chunk);
          // If this is not the first chunk, strip the header row
          if (i > 0) {
            const firstNewline = csv.indexOf("\n");
            controller.enqueue(encoder.encode(firstNewline >= 0 ? csv.slice(firstNewline + 1) : ""));
          } else {
            controller.enqueue(encoder.encode(csv));
          }
        }

        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[backup/csv] Failed:", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Failed to export CSV." } },
      { status: 500 },
    );
  }
}
