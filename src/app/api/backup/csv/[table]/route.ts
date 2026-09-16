/**
 * GET /api/backup/csv/[table]
 *
 * Exports one table as a CSV file (downloadable).
 *
 * Supported tables: customers, products, sales, saleItems, payments,
 * stockMoves, expenses, transactions
 *
 * Returns the CSV with Content-Disposition: attachment; filename="table-YYYY-MM-DD.csv"
 */

import { NextRequest, NextResponse } from "next/server";
import {
  fetchTableRows,
  rowsToCsv,
  EXPORTABLE_TABLES,
  type ExportableTable,
} from "@/lib/services/backup";

export const dynamic = "force-dynamic";

const VALID_TABLES = new Set<string>(EXPORTABLE_TABLES.map((t) => t.value));

export async function GET(
  _req: NextRequest,
  { params }: { params: { table: string } },
) {
  try {
    const { table } = params;

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

    const rows = await fetchTableRows(table as ExportableTable);
    const csv = rowsToCsv(rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${table}-${dateStr}.csv`;

    // Prepend UTF-8 BOM so Excel reads it correctly (otherwise it might
    // misinterpret the encoding for non-ASCII characters in names).
    const bom = "\uFEFF";
    const csvWithBom = bom + csv;

    return new NextResponse(csvWithBom, {
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
