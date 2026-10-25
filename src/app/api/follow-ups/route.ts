/**
 * /api/follow-ups
 *
 * GET  ?filter=open|resolved|all → { items, stats }
 * POST                          → save an opportunity to work on
 *
 * A follow-up is created from the owner's own sales history and its outcome
 * is recorded by the owner. Nothing here sends a message or marks one sent.
 */

import { NextRequest } from "next/server";
import {
  listFollowUps,
  getFollowUpStats,
  createFollowUp,
} from "@/lib/services/follow-ups";
import { ok, fail, parseJsonBody, getQueryParam } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

type Filter = "open" | "resolved" | "all";

function parseFilter(value: string | null | undefined): Filter {
  return value === "resolved" || value === "all" ? value : "open";
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const filter = parseFilter(getQueryParam(req, "filter"));

    const [items, stats] = await Promise.all([
      listFollowUps(userId, filter),
      getFollowUpStats(userId),
    ]);

    return ok({ items, stats });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const result = await createFollowUp(data as never, userId);
    return ok(result, result.created ? 201 : 200);
  } catch (error) {
    return fail(error);
  }
}
