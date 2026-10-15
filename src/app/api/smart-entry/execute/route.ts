/**
 * POST /api/smart-entry/execute
 * Routes by intentType to the correct execute function.
 */
import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import {
  executeSession, executeExpenseSession, executePaymentSession,
  executeStockIntakeSession, executeProductCreationSession, executeCustomerCreationSession,
} from "@/lib/smart-entry/service";
import { executeRequestSchema } from "@/lib/smart-entry/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId(req);
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) throw new BadRequestError(error || "Invalid request body.");
    const parsed = executeRequestSchema.safeParse(data);
    if (!parsed.success) throw new BadRequestError("Invalid request", parsed.error.issues);
    const input = parsed.data;

    switch (input.intentType) {
      case "CREATE_CREDIT_SALE": {
        if (!input.customerId || !input.productId || !input.quantity) throw new BadRequestError("customerId, productId, and quantity are required.");
        return ok(await executeSession(userId, { sessionId: input.sessionId, customerId: input.customerId, productId: input.productId, quantity: input.quantity, unitPrice: input.unitPrice, paidAmount: input.paidAmount, batchId: input.batchId }));
      }
      case "CREATE_EXPENSE": {
        if (!input.expenseName || !input.amount || !input.expenseCategory) throw new BadRequestError("expenseName, amount, and expenseCategory are required.");
        return ok(await executeExpenseSession(userId, { sessionId: input.sessionId, expenseName: input.expenseName, amount: input.amount, category: input.expenseCategory, notes: input.notes, date: input.date }));
      }
      case "RECORD_PAYMENT": {
        if (!input.customerId || !input.amount) throw new BadRequestError("customerId and amount are required.");
        return ok(await executePaymentSession(userId, { sessionId: input.sessionId, customerId: input.customerId, amount: input.amount, method: input.method, notes: input.notes, date: input.date }));
      }
      case "STOCK_INTAKE": {
        if (!input.productId || !input.quantity) throw new BadRequestError("productId and quantity are required.");
        return ok(await executeStockIntakeSession(userId, { sessionId: input.sessionId, productId: input.productId, quantity: input.quantity, unitCost: input.unitCost, batchName: input.batchName ?? null, date: input.date }));
      }
      case "CREATE_PRODUCT": {
        if (!input.name || !input.unit || input.purchasePrice == null || input.sellingPrice == null) throw new BadRequestError("name, unit, purchasePrice, and sellingPrice are required.");
        return ok(await executeProductCreationSession(userId, { sessionId: input.sessionId, name: input.name, unit: input.unit, purchasePrice: input.purchasePrice, sellingPrice: input.sellingPrice, openingStock: input.openingStock, lowStockThreshold: input.lowStockThreshold, category: input.category, sku: input.sku }));
      }
      case "CREATE_CUSTOMER": {
        if (!input.name) throw new BadRequestError("name is required.");
        return ok(await executeCustomerCreationSession(userId, { sessionId: input.sessionId, name: input.name, phone: input.phone, address: input.address, notes: input.notes, openingBalance: input.openingBalance }));
      }
      default:
        throw new BadRequestError(`Unknown intentType: ${input.intentType}`);
    }
  } catch (error) {
    return fail(error);
  }
}
