/**
 * POST /api/assistant/confirm
 *
 * Executes a prepared action after the user confirms it.
 *
 * Body:
 *   {
 *     actionId: "cuid",
 *     patch?: { paidAmount?: 15000, customerId?: "...", productId?: "..." }
 *   }
 *
 * `patch` lets the confirmation card fill in what the spoken command left out
 * (for example the paid amount) without re-running the AI.
 *
 * Guarantees:
 *   - the action must belong to the signed-in user,
 *   - a DONE action returns its stored result instead of executing again,
 *   - a conditional status transition prevents a double execution.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { confirmAction } from "@/lib/assistant/service";
import type { PlanPayload } from "@/lib/assistant/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const ALLOWED_PATCH_KEYS: Array<keyof PlanPayload> = [
  "customerId",
  "supplierId",
  "productId",
  "quantity",
  "unit",
  "unitPrice",
  "unitCost",
  "total",
  "paidAmount",
  "discountAmount",
  "method",
  "date",
  "dueDate",
  "name",
  "phone",
  "address",
  "openingBalance",
  "category",
  "expenseName",
  "amount",
  "notes",
  "reminderTitle",
  "reminderDueAt",
  "reminderType",
  "reminderPriority",
  "batchName",
  "purchasePrice",
  "sellingPrice",
  "openingStock",
  "sku",
  "lowStockThreshold",
  "targetId",
];

type Body = {
  actionId?: unknown;
  patch?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);
    const { data: body } = await parseJsonBody<Body>(req);
    if (!body) throw new BadRequestError("A request body is required.");

    const actionId = typeof body.actionId === "string" ? body.actionId : "";
    if (!actionId) throw new BadRequestError("actionId is required.");

    const patch: Partial<PlanPayload> = {};
    if (body.patch && typeof body.patch === "object") {
      for (const key of ALLOWED_PATCH_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body.patch, key)) {
          // The service re-validates everything through the normal schemas.
          (patch as Record<string, unknown>)[key] = body.patch[key];
        }
      }
    }

    const reply = await confirmAction(userId, actionId, patch);
    return ok(reply);
  } catch (error) {
    return fail(error);
  }
}
