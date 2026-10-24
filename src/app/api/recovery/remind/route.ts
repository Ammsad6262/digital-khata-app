/**
 * /api/recovery/remind
 *
 * POST { customerId, days? }
 *
 * Creates a real, open payment-collection reminder linked to the customer.
 * It appears in the normal Reminders module and does not change the balance.
 */

import { NextRequest } from "next/server";
import {
  createRecoveryReminder,
  type RecoveryReminderInput,
} from "@/lib/services/recovery";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<RecoveryReminderInput>(req);
    if (error || !data) return fail(new Error(error ?? "Invalid body."));

    const result = await createRecoveryReminder(userId, data);
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
