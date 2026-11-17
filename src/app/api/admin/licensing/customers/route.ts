import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getLicensingOverview,
  grantOwner,
  revokeOwner,
  revokePremium,
  revokeAccess,
  restoreAccess,
  revokeAffiliate,
  revokeCore,
} from "@/lib/services/entitlement";
import { requireAdmin } from "@/lib/auth/admin";
import { invalidateActiveAccessCache } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grantOwner"), userId: z.string().min(1) }),
  z.object({
    action: z.literal("revokeOwner"),
    userId: z.string().min(1),
    confirm: z.boolean(),
  }),
  z.object({ action: z.literal("revokePremium"), userId: z.string().min(1) }),
  z.object({
    action: z.literal("revokeAffiliate"),
    userId: z.string().min(1),
    confirm: z.boolean(),
  }),
  z.object({
    action: z.literal("revokeCore"),
    userId: z.string().min(1),
    confirm: z.boolean(),
  }),
  z.object({
    action: z.literal("revokeAccess"),
    userId: z.string().min(1),
    reason: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal("restoreAccess"), userId: z.string().min(1) }),
]);

/** GET /api/admin/licensing/customers — customers + summary, owner-only. */
export async function GET(req: NextRequest) {
  try {
    requireAdmin(req);
    return ok(await getLicensingOverview());
  } catch (error) {
    return fail(error);
  }
}

/** POST — owner/affiliate/premium/access administration. */
export async function POST(req: NextRequest) {
  try {
    requireAdmin(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));
    const parsed = actionSchema.parse(data);

    switch (parsed.action) {
      // Every branch that changes entitlement must drop the 60-second
      // per-process entitlement cache, or a revoked user keeps full access
      // (and a restored user stays locked out) until that cache expires.
      case "grantOwner": {
        const result = await grantOwner(parsed.userId);
        invalidateActiveAccessCache(parsed.userId);
        return ok(result);
      }
      case "revokeOwner": {
        const result = await revokeOwner(parsed.userId, parsed.confirm);
        invalidateActiveAccessCache(parsed.userId);
        return ok(result);
      }
      case "revokePremium": {
        const result = await revokePremium(parsed.userId);
        invalidateActiveAccessCache(parsed.userId);
        return ok(result);
      }
      case "revokeAffiliate": {
        const result = await revokeAffiliate(parsed.userId, parsed.confirm);
        invalidateActiveAccessCache(parsed.userId);
        return ok(result);
      }
      case "revokeCore": {
        const result = await revokeCore(parsed.userId, parsed.confirm);
        invalidateActiveAccessCache(parsed.userId);
        return ok(result);
      }
      case "revokeAccess": {
        const result = await revokeAccess(parsed.userId, parsed.reason ?? "");
        invalidateActiveAccessCache(parsed.userId);
        return ok(result);
      }
      case "restoreAccess": {
        const result = await restoreAccess(parsed.userId);
        invalidateActiveAccessCache(parsed.userId);
        return ok(result);
      }
      default:
        throw new BadRequestError("api.licensing.invalidAction");
    }
  } catch (error) {
    return fail(error);
  }
}