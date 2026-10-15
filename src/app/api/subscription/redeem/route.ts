import { NextRequest } from "next/server";
import { z } from "zod";
import { redeemCode } from "@/lib/services/subscription";
import { requireUserId } from "@/lib/auth/get-current-user";
import { checkRateLimit, recordFailure, recordSuccess, getClientIp } from "@/lib/auth/rate-limiter";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const redeemSchema = z.object({
  code: z.string().min(1, "api.subscription.codeRequired").max(50, "api.subscription.codeTooLong"),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const ip = getClientIp(req);

    const { locked } = checkRateLimit(ip);
    if (locked) {
      throw new BadRequestError("api.subscription.rateLimited");
    }

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const parsed = redeemSchema.parse(data);
    const result = await redeemCode(userId, parsed.code);

    recordSuccess(ip);
    return ok(result);
  } catch (error) {
    const ip = getClientIp(req);
    recordFailure(ip);
    return fail(error);
  }
}
