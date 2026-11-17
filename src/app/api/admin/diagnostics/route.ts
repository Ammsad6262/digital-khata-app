/**
 * GET /api/admin/diagnostics
 *
 * Developer-only. This is the ONE place that exposes the technical details the
 * business owner must never see in the normal assistant:
 *
 *   - the three free Gemini model ids,
 *   - per-model request counters and daily limits,
 *   - cooldowns / provider health,
 *   - the configured AI timeouts,
 *   - recent failed assistant actions.
 *
 * It is gated by the `ADMIN_SECRET` header (constant-time compare), exactly like
 * the other `/api/admin/*` routes. It is NOT part of the assistant UI.
 */

import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { ok, fail } from "@/lib/utils/api";
import { getRotationStatus } from "@/lib/ai/model-registry";
import { attemptTimeoutMs, deadlineMs, httpTimeoutMs } from "@/lib/ai/gemini-client";
import { aiKeyStatus } from "@/lib/ai/key-pool";
import { isEmailVerificationEnforced } from "@/lib/services/email-verification";
import { isEmailProviderConfigured } from "@/lib/email/send-email";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    requireAdmin(req);

    // Both pools report their own counters so the owner can see that their
    // testing is not consuming the customer key's daily budget.
    const [customerRotation, ownerRotation] = await Promise.all([
      getRotationStatus("user"),
      getRotationStatus("owner"),
    ]);
    const rotation = customerRotation;

    let recentFailures: Array<{ action: string; error: string | null; at: string }> = [];
    try {
      const rows = await prisma.assistantAction.findMany({
        where: { status: "FAILED" },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { kind: true, error: true, createdAt: true },
      });
      recentFailures = rows.map((row) => ({
        action: row.kind,
        error: row.error,
        at: row.createdAt.toISOString(),
      }));
    } catch {
      // A missing table must not break the diagnostics page.
      recentFailures = [];
    }

    return ok({
      rotation,
      ownerRotation,
      config: {
        attemptTimeoutMs: attemptTimeoutMs(),
        deadlineMs: deadlineMs(),
        httpTimeoutMs: httpTimeoutMs(),
        // Booleans only — never the key values.
        keys: aiKeyStatus(),
        apiKeyConfigured: aiKeyStatus().user,
      },
      recentFailures,
      // Booleans only — never the key value, never a recipient address.
      emailVerification: {
        enforced: isEmailVerificationEnforced(),
        providerConfigured: isEmailProviderConfigured(),
      },
    });
  } catch (error) {
    return fail(error);
  }
}
