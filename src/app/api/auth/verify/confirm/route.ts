/**
 * POST /api/auth/verify/confirm
 * Body: { code: "123456" }
 *
 * Returns:
 *   200 { ok: true, verified: true }                        — success
 *   400 { ok: false, error: { messageKey: "..." } }         — wrong / missing code
 *   410 { ok: false, error: { messageKey: "..." } }         — expired or attempts exhausted
 *
 * The code is checked by the service layer (attempt cap, timing-safe compare,
 * single-use consumption). This route only validates the shape and maps the
 * discriminated result to HTTP + a translation key.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { invalidateActiveAccessCache, requireUserId } from "@/lib/auth/get-current-user";
import { fail } from "@/lib/utils/api";
import { tServer } from "@/lib/i18n/server";
import { BadRequestError } from "@/lib/errors";
import {
  CODE_LENGTH,
  confirmVerificationCode,
  normaliseVerificationCode,
} from "@/lib/services/email-verification";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  // Exactly six digits after stripping spaces/dashes and mapping local numerals.
  code: z
    .string()
    .transform((value) => normaliseVerificationCode(value))
    .refine((value) => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value), {
      message: "api.verify.codeRequired",
    }),
});

function failed(status: number, code: string, messageKey: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message: tServer(messageKey),
        messageKey,
        translationKey: true,
      },
    },
    { status },
  );
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req, { requireActiveSubscription: false });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new BadRequestError("api.errors.invalidJson");
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestError("api.verify.codeRequired");

    const result = await confirmVerificationCode(userId, parsed.data.code);

    switch (result.status) {
      case "ok":
        invalidateActiveAccessCache(userId);
        return NextResponse.json({
          ok: true,
          verified: true,
          verifiedAt: result.verifiedAt.toISOString(),
        });
      case "already_verified":
        // Idempotent: pressing "verify" on an already-verified account is a
        // success, not an error.
        return NextResponse.json({ ok: true, verified: true, alreadyVerified: true });
      case "expired":
        return failed(410, "GONE", "api.verify.codeExpired");
      case "too_many_attempts":
        return failed(410, "GONE", "api.verify.tooManyAttempts");
      case "invalid":
        return failed(400, "BAD_REQUEST", "api.verify.invalidCode");
    }
  } catch (error) {
    return fail(error);
  }
}