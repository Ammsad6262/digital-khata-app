import { NextRequest } from "next/server";
import { z } from "zod";
import {
  generateLicenseCodes,
  listLicenseCodes,
  revokeLicenseCode,
  type LicenseKind,
} from "@/lib/services/entitlement";
import { requireAdmin } from "@/lib/auth/admin";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const generateSchema = z.object({
  kind: z.enum(["PRODUCT", "PREMIUM", "AFFILIATE"]),
  count: z.number().int().min(1).max(100).default(1),
  label: z.string().max(80).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const revokeSchema = z.object({
  codeId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    requireAdmin(req);
    return ok(await listLicenseCodes());
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
    const codes = await generateLicenseCodes({
      kind: parsed.kind as LicenseKind,
      count: parsed.count,
      label: parsed.label ?? null,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
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
    const parsed = revokeSchema.parse(data);
    return ok(await revokeLicenseCode(parsed.codeId));
  } catch (error) {
    return fail(error);
  }
}