/**
 * POST /api/reminders/[id]/snooze
 *
 * Push a reminder back by N days. Used by the one-tap "1 day / 3 days /
 * 1 week" buttons on every reminder card, so the owner never has to open the
 * reminder just to move it.
 */

import { NextRequest } from "next/server";
import { snoozeReminder } from "@/lib/services/reminders";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const { data, error } = await parseJsonBody<{ days?: unknown }>(req);
    if (error) return fail(new Error(error));

    const reminder = await snoozeReminder(id, Number(data?.days), userId);
    return ok(reminder);
  } catch (error) {
    return fail(error);
  }
}
