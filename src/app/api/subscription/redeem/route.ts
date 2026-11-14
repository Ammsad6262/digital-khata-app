import { NextRequest } from "next/server";
import { z } from "zod";
import { redeemCode } from "@/lib/services/subscription";
import { invalidateActiveAccessCache, requireUserId } from "@/lib/auth/get-current-user";
import { checkRateLimit, recordFailure, recordSuccess, getClientIp } from "@/lib/auth/rate-limiter";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const redeemSchema = z.object({
  code: z.string().min(1, "api.subscription.codeRequired").max(50, "api.subscription.codeTooLong"),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rateKey = `redeem:${ip}`;

  try {
    const userId = await requireUserId(req, { requireActiveSubscription: false });

    const { locked } = checkRateLimit(rateKey);
    if (locked) {
      throw new BadRequestError("api.subscription.rateLimited");
    }

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = redeemSchema.parse(data);
    const result = await redeemCode(userId, parsed.code);

    recordSuccess(rateKey);
    invalidateActiveAccessCache(userId);
    return ok(result);
  } catch (error) {
    recordFailure(rateKey);
    return fail(error);
  }
}
