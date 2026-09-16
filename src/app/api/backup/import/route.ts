/**
 * POST /api/backup/import
 *
 * Body: { content: string (JSON file contents), confirmReplace: boolean }
 *
 * Validates the backup file, verifies referential integrity, then replaces
 * all existing data inside a single prisma.$transaction.
 *
 * On success: returns { imported: BackupFile["counts"] }
 * On failure: returns { error: { code, message } } with appropriate status
 *   - 400: malformed file, missing tables, version mismatch, dangling FKs
 *   - 500: unexpected server error (transaction rolled back, original data safe)
 */

import { NextRequest, NextResponse } from "next/server";
import { importBackup } from "@/lib/services/backup";
import { AppError } from "@/lib/errors";
import { ZodError } from "zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  content: z.string().min(1, "File content is required."),
  confirmReplace: z.boolean().refine((v) => v === true, {
    message: "confirmReplace must be true to proceed with import.",
  }),
});

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as unknown;
    const parsed = importSchema.parse(body);

    const result = await importBackup(parsed.content, {
      confirmReplace: parsed.confirmReplace,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: error.issues[0]?.message ?? "Invalid input." } },
        { status: 400 },
      );
    }
    console.error("[backup/import] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Failed to import backup. No data was changed." } },
      { status: 500 },
    );
  }
}
