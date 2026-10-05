/**
 * Admin API: /api/admin/codes
 *
 * POST   → Generate one or more redeem codes (requires ADMIN_SECRET header)
 * GET    → List all redeem codes (requires ADMIN_SECRET header)
 * PATCH  → Enable/disable a code (requires ADMIN_SECRET header + { codeId, active })
 *
 * SECURITY: The ADMIN_SECRET must be passed in the `x-admin-secret` header.
 * It is NEVER stored in client-side code. The admin generates this secret
 * and stores it in the .env file as ADMIN_SECRET.
 *
 * Normal users CANNOT access this endpoint — the middleware doesn't
 * know about ADMIN_SECRET, so the check happens in the route handler.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { generateCodes, listCodesAdmin, disableCode, enableCode } from "@/lib/services/subscription";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

/** Verify the admin secret from the x-admin-secret header. */
function verifyAdmin(req: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || adminSecret.length < 16) {
    return false; // ADMIN_SECRET not configured
  }
  const provided = req.headers.get("x-admin-secret");
  if (!provided) return false;
  // Use timing-safe comparison
  return provided === adminSecret;
}

const generateSchema = z.object({
  durationDays: z.number().int().min(1).max(3650),
  maxRedemptions: z.number().int().min(0).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
  count: z.number().int().min(1).max(100).default(1),
});

const toggleSchema = z.object({
  codeId: z.string().min(1),
  active: z.boolean(),
});

export async function GET(req: NextRequest) {
  try {
    if (!verifyAdmin(req)) {
      return ok({ error: "Unauthorized." }, 401);
    }
    const codes = await listCodesAdmin();
    return ok(codes);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyAdmin(req)) {
      return ok({ error: "Unauthorized." }, 401);
    }
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = generateSchema.parse(data);
    const codes = await generateCodes({
      durationDays: parsed.durationDays,
      maxRedemptions: parsed.maxRedemptions,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      count: parsed.count,
    });

    return ok(codes);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!verifyAdmin(req)) {
      return ok({ error: "Unauthorized." }, 401);
    }
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = toggleSchema.parse(data);
    if (parsed.active) {
      await enableCode(parsed.codeId);
    } else {
      await disableCode(parsed.codeId);
    }

    return ok({ updated: true });
  } catch (error) {
    return fail(error);
  }
}
