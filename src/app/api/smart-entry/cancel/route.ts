/**
 * POST /api/smart-entry/cancel
 */
import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { z } from "zod";
import { cancelSession } from "@/lib/smart-entry/service";

export const dynamic = "force-dynamic";

const schema = z.object({ sessionId: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) throw new BadRequestError(error || "Invalid request body.");
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new BadRequestError("Invalid request");
    const result = await cancelSession(userId, parsed.data.sessionId);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
