/**
 * /api/recovery/contact
 *
 * POST { customerId, method, notes? }
 *
 * Records that the owner contacted a customer about money owed. The record is
 * a completed payment-collection reminder. It never changes the balance.
 */

import { NextRequest } from "next/server";
import {
  logRecoveryContact,
  type RecoveryContactInput,
} from "@/lib/services/recovery";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { requireUserId } from "@/lib/auth/get-current-user";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<RecoveryContactInput>(req);
    if (error || !data) return fail(new Error(error ?? "Invalid body."));

    const result = await logRecoveryContact(userId, data);
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
