import { NextRequest } from "next/server";
import { z } from "zod";
import { generateCodes, listCodesAdmin, disableCode, enableCode } from "@/lib/services/subscription";
import { requireAdmin } from "@/lib/auth/admin";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export const dynamic = "force-dynamic";

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
    requireAdmin(req);
    const codes = await listCodesAdmin();
    return ok(codes);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    requireAdmin(req);
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
    requireAdmin(req);
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
