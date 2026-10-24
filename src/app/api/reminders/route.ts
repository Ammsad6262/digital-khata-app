/**
 * /api/reminders
 *
 * GET  ?filter=overdue|today|upcoming|completed|all  → { items, counts }
 * POST → create a reminder
 */

import { NextRequest } from "next/server";
import {
  listReminders,
  getReminderCounts,
  createReminder,
  type ReminderFilter,
} from "@/lib/services/reminders";
import { ok, fail, parseJsonBody, getQueryParam } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

const FILTERS: ReminderFilter[] = ["overdue", "today", "upcoming", "completed", "all"];

function parseFilter(value: string | null | undefined): ReminderFilter {
  return FILTERS.includes((value ?? "") as ReminderFilter)
    ? ((value ?? "all") as ReminderFilter)
    : "all";
}

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const filter = parseFilter(getQueryParam(req, "filter"));
    const timezone = getQueryParam(req, "timezone") ?? "Asia/Karachi";

    const [items, counts] = await Promise.all([
      listReminders(filter, userId, timezone),
      getReminderCounts(userId, timezone),
    ]);

    return ok({ items, counts });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error) return fail(new Error(error));

    const reminder = await createReminder(data, userId);
    return ok(reminder, 201);
  } catch (error) {
    return fail(error);
  }
}
