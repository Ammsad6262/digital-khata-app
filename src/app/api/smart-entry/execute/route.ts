/**
 * POST /api/smart-entry/execute
 *
 * V10: Multi-intent execute. The client sends `intentType` which tells the
 * backend which execute function to call:
 *   - CREATE_CREDIT_SALE → executeSession (existing sale creation)
 *   - CREATE_EXPENSE → executeExpenseSession (new, reuses recordExpense)
 *   - RECORD_PAYMENT → executePaymentSession (new, reuses recordPayment)
 *   - STOCK_INTAKE → not yet implemented (falls back to error)
 *
 * The backend RE-VALIDATES everything server-side — never trusts client values.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { tServer } from "@/lib/i18n/server";
import { executeSession, executeExpenseSession, executePaymentSession, executeStockIntakeSession, executeProductCreationSession, executeCustomerCreationSession, executeSupplierPaymentSession, executeReminderSession } from "@/lib/smart-entry/service";
import { checkExecuteLimit } from "@/lib/smart-entry/rate-limit";
import { executeRequestSchema } from "@/lib/smart-entry/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);

    const limit = checkExecuteLimit(userId);
    if (!limit.allowed) {
      throw new BadRequestError(
        "api.smartExecute.rateLimited",
        undefined,
        { seconds: limit.retryAfterSec },
      );
    }

    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) {
      throw new BadRequestError(error || tServer("api.errors.invalidBody"));
    }

    const parsed = executeRequestSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestError(
        "api.errors.invalidRequest",
        parsed.error.issues,
        { details: parsed.error.issues.map((i) => i.message).join("; ") },
      );
    }

    const input = parsed.data;

    // V10: Route by intentType
    switch (input.intentType) {
      case "CREATE_CREDIT_SALE": {
        if (!input.customerId || !input.productId || !input.quantity) {
          throw new BadRequestError("api.smartExecute.creditSaleMissingFields");
        }
        const result = await executeSession(userId, {
          sessionId: input.sessionId,
          customerId: input.customerId,
          productId: input.productId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          paidAmount: input.paidAmount,
          batchId: input.batchId,
        });
        return ok(result);
      }

      case "CREATE_EXPENSE": {
        if (!input.expenseName || !input.amount || !input.expenseCategory) {
          throw new BadRequestError("api.smartExecute.expenseMissingFields");
        }
        const result = await executeExpenseSession(userId, {
          sessionId: input.sessionId,
          expenseName: input.expenseName,
          amount: input.amount,
          category: input.expenseCategory,
          notes: input.notes,
          date: input.date,
        });
        return ok(result);
      }

      case "RECORD_PAYMENT": {
        if (!input.customerId || !input.amount) {
          throw new BadRequestError("api.smartExecute.paymentMissingFields");
        }
        const result = await executePaymentSession(userId, {
          sessionId: input.sessionId,
          customerId: input.customerId,
          amount: input.amount,
          method: input.method,
          notes: input.notes,
          date: input.date,
        });
        return ok(result);
      }

      case "SUPPLIER_PAYMENT": {
        if (!input.supplierId || !input.amount) {
          throw new BadRequestError("api.smartExecute.supplierPaymentMissingFields");
        }
        const result = await executeSupplierPaymentSession(userId, {
          sessionId: input.sessionId,
          supplierId: input.supplierId,
          amount: input.amount,
          method: input.method,
          notes: input.notes,
          date: input.date,
        });
        return ok(result);
      }

      case "CREATE_REMINDER": {
        if (!input.reminderTitle || !input.reminderDueAt) {
          throw new BadRequestError("api.smartExecute.reminderMissingFields");
        }
        const result = await executeReminderSession(userId, {
          sessionId: input.sessionId,
          title: input.reminderTitle,
          dueAt: input.reminderDueAt,
          type: input.reminderType,
          priority: input.reminderPriority,
          notes: input.notes,
          customerId: input.customerId,
        });
        return ok(result);
      }

      case "STOCK_INTAKE": {
        if (!input.productId || !input.quantity) {
          throw new BadRequestError("api.smartExecute.stockIntakeMissingFields");
        }
        const result = await executeStockIntakeSession(userId, {
          sessionId: input.sessionId,
          productId: input.productId,
          quantity: input.quantity,
          unitCost: input.unitCost,
          batchName: input.batchName ?? null,
          date: input.date,
        });
        return ok(result);
      }

      case "CREATE_PRODUCT": {
        if (!input.name || !input.unit || input.purchasePrice == null || input.sellingPrice == null) {
          throw new BadRequestError("api.smartExecute.productMissingFields");
        }
        const result = await executeProductCreationSession(userId, {
          sessionId: input.sessionId,
          name: input.name,
          unit: input.unit,
          purchasePrice: input.purchasePrice,
          sellingPrice: input.sellingPrice,
          openingStock: input.openingStock,
          lowStockThreshold: input.lowStockThreshold,
          category: input.category,
          sku: input.sku,
        });
        return ok(result);
      }

      case "CREATE_CUSTOMER": {
        if (!input.name) {
          throw new BadRequestError("api.smartExecute.customerMissingFields");
        }
        const result = await executeCustomerCreationSession(userId, {
          sessionId: input.sessionId,
          name: input.name,
          phone: input.phone,
          address: input.address,
          notes: input.notes,
          openingBalance: input.openingBalance,
        });
        return ok(result);
      }

      default:
        throw new BadRequestError("api.smartExecute.unknownIntent", undefined, { intent: input.intentType });
    }
  } catch (error) {
    return fail(error);
  }
}
