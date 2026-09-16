/**
 * GET /api/backup/export
 *
 * Returns the entire database as a JSON file. The Content-Disposition header
 * triggers a browser download with a timestamped filename like:
 *   digital-khata-backup-2026-09-16.json
 */

import { NextResponse } from "next/server";
import { exportBackup } from "@/lib/services/backup";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const backup = await exportBackup();
    const json = JSON.stringify(backup, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `digital-khata-backup-${dateStr}.json`;

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[backup/export] Failed:", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Failed to export backup." } },
      { status: 500 },
    );
  }
}
