/**
 * /api/reminders/[id]
 *
 * GET    → fetch one reminder
 * PATCH  → update fields and/or toggle `completed`
 * DELETE → delete a reminder
 */

import { NextRequest } from "next/server";
import {
  getReminder,
  updateReminder,
  setReminderCompleted,
  deleteReminder,
} from "@/lib/services/reminders";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const reminder = await getReminder(id, userId);
    return ok(reminder);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const { data, error } = await parseJsonBody<Record<string, unknown>>(req);
    if (error) return fail(new Error(error));
    if (!data || typeof data !== "object") return fail(new Error("Invalid body."));

    const { completed, ...rest } = data;
    const hasFields = Object.keys(rest).length > 0;

    let reminder = hasFields
      ? await updateReminder(id, rest, userId)
      : await getReminder(id, userId);

    if (typeof completed === "boolean") {
      reminder = await setReminderCompleted(id, completed, userId);
    }

    return ok(reminder);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId(req);
    const { id } = await params;
    const result = await deleteReminder(id, userId);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
