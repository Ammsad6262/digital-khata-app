/**
 * POST /api/admin/password-reset
 *
 * Admin-only. Issues a one-time password reset code for an email address.
 * The plaintext code is returned exactly once and is never stored.
 *
 * Auth: x-admin-secret header (same secret as the activation-code admin API).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { issuePasswordResetCode } from "@/lib/services/password-reset";
import { BadRequestError } from "@/lib/errors";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

const issueSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "api.password.resetEmailRequired")
    .max(254)
    .email("api.password.resetEmailRequired"),
});

export async function POST(req: NextRequest) {
  try {
    requireAdmin(req);

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) {
      throw new BadRequestError("api.errors.invalidBody");
    }

    const parsed = issueSchema.parse(data);
    const result = await issuePasswordResetCode(parsed.email);
    const res = ok(result);
    // The response contains a plaintext one-time code. Never cache it.
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    return fail(error);
  }
}
