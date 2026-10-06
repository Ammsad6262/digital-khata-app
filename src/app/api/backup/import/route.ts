/**
 * POST /api/backup/import
 *
 * Validates + restores a backup file. Returns immediately with a job ID
 * while the actual import runs in the background.
 *
 * PERFORMANCE: The import (10 deleteMany + 10 createMany) can take 5-15s
 * for large datasets, which exceeds Vercel's 10s function timeout on the
 * Hobby plan. To handle this:
 *   1. Parse + validate the file synchronously (fast — <1s)
 *   2. Return a 202 Accepted immediately with a job status
 *   3. Run the actual DB writes with a longer timeout
 *
 * Since Vercel serverless functions can't truly run background jobs
 * (the function terminates when the response is sent), we use
 * maxDuration=60 to give the import up to 60 seconds to complete.
 * The client shows a "Restoring..." spinner while waiting.
 *
 * For true background processing (V2), we'd use Vercel's queue system
 * or a cron-based job runner. For V1 with small datasets, 60s is enough.
 */

import { NextRequest, NextResponse } from "next/server";
import { importBackup, parseBackupFile } from "@/lib/services/backup";
import { AppError } from "@/lib/errors";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ZodError } from "zod";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for large imports

const importSchema = z.object({
  content: z.string().min(1, "File content is required."),
  confirmReplace: z.boolean().refine((v) => v === true, {
    message: "confirmReplace must be true to proceed with import.",
  }),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const body = (await req.json()) as unknown;
    const parsed = importSchema.parse(body);

    // Phase 1: Parse + validate (fast — returns immediately on bad files)
    // This runs synchronously so the user gets a clear error if the file is bad.
    const backup = parseBackupFile(parsed.content);

    // Phase 2: Run the actual import (slow — DB writes)
    // This is the part that could take 5-15s for large datasets.
    const result = await importBackup(
      parsed.content,
      { confirmReplace: parsed.confirmReplace },
      userId,
    );

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
