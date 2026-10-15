/**
 * Smart Entry service — intent routing + entity resolution + execution.
 *
 * Flow:
 *   1. User speaks/types → /interpret
 *   2. AI returns intent + extracted fields
 *   3. Backend resolves names → IDs against THIS USER's records
 *   4. Backend returns FORM status with intent-specific form data
 *   5. UI shows the correct form for the detected intent
 *   6. User reviews/edits → /execute
 *   7. /execute re-validates + calls existing service (createSale, recordExpense, etc.)
 *
 * Intent routing (V13):
 *   CREATE_CREDIT_SALE → sale form (EditableFormView)
 *   CREATE_EXPENSE → expense form
 *   RECORD_PAYMENT → payment form (with outstanding balance display)
 *   CREATE_PRODUCT → product creation form (NOT sale form)
 *   CREATE_CUSTOMER → customer creation form (NOT sale form)
 *   STOCK_INTAKE → stock intake form
 *   QUERY → query result
 *   UNKNOWN → clarification question (NOT sale form)
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { BadRequestError, NotFoundError, AppError, ErrorCode } from "@/lib/errors";
import { createSale } from "@/lib/services/sales";
import { recordExpense } from "@/lib/services/expenses";
import { recordPayment } from "@/lib/services/payments";
import { addStockMove } from "@/lib/services/stock";
import { createProduct } from "@/lib/services/products";
import { createCustomer } from "@/lib/services/customers";
import { invalidateCache } from "@/lib/utils/cache";
import { getAIProvider, AIUnavailableError } from "./gemini-provider";
import type { AIContext } from "./gemini-provider";
import {
  aiInterpretationSchema,
  type AiInterpretation,
  type EntityCandidate,
} from "./schema";
import type { Prisma } from "@prisma/client";

const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

function aiToPrismaJson(ai: AiInterpretation): Prisma.InputJsonValue {
  return ai as unknown as Prisma.InputJsonValue;
}

// ── Public types ─────────────────────────────────────────────────────────────

export type FormFieldState = {
  customerNameRaw: string | null;
  productNameRaw: string | null;
  quantityRaw: number | null;
  unitRaw: string | null;
  batchNameRaw: string | null;
  explicitUnitPrice: number | null;
  explicitTotal: number | null;
  explicitPaidAmount: number | null;
  resolvedCustomerId: string | null;
  resolvedProductId: string | null;
  resolvedBatchId: string | null;
  batchCandidates: Array<{
    id: string; batchName: string | null; remainingQuantity: string; unitCost: string | null; date: Date;
  }>;
  batchSelectionRequired: boolean;
  unitPrice: number | null;
  totalAmount: number | null;
  priceSource: string;
  paidAmount: number | null;
  balance: number | null;
  priceConflict: { unitPrice: number; total: number; calculatedTotal: number } | null;
  isNewCustomer: boolean;
  isNewProduct: boolean;
  customerCandidates: EntityCandidate[];
  productCandidates: EntityCandidate[];
  hint: string | null;
};

export type ExpenseFormState = {
  expenseName: string | null;
  amount: number | null;
  category: string;
  notes: string | null;
  date: string | null;
};

export type PaymentFormState = {
  customerNameRaw: string | null;
  resolvedCustomerId: string | null;
  amount: number | null;
  method: string;
  notes: string | null;
  date: string | null;
  isNewCustomer: boolean;
  customerCandidates: EntityCandidate[];
  customerBalance: string | null;
};

export type QueryResultState = {
  queryType: string;
  queryEntity: string | null;
  queryDateRange: string | null;
  result: string;
  data: unknown;
};

export type StockIntakeFormState = {
  productNameRaw: string | null;
  resolvedProductId: string | null;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  batchName: string | null;
  date: string | null;
  isNewProduct: boolean;
  productCandidates: EntityCandidate[];
};

export type ProductCreationFormState = {
  name: string | null;
  unit: string | null;
  category: string | null;
  sku: string | null;
  purchasePrice: number | null;
  sellingPrice: number | null;
  openingStock: number | null;
  lowStockThreshold: number;
  hint: string | null;
  mentionedStock: boolean;
};

export type CustomerCreationFormState = {
  name: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  openingBalance: number | null;
  hint: string | null;
};

export type ClarificationState = {
  question: string;
  suggestions: string[];
};

export type InterpretResult = {
  sessionId: string;
  status: "FORM" | "FAILED";
  transcript: string | null;
  intent: string;
  form?: FormFieldState;
  expenseForm?: ExpenseFormState;
  paymentForm?: PaymentFormState;
  queryResult?: QueryResultState;
  stockIntakeForm?: StockIntakeFormState;
  productCreationForm?: ProductCreationFormState;
  customerCreationForm?: CustomerCreationFormState;
  clarification?: ClarificationState;
  message?: string;
};

export type ExecuteResult = {
  saleId?: string;
  totalAmount?: string;
  outstanding?: string;
  expenseId?: string;
  paymentId?: string;
  productId?: string;
  customerId?: string;
  resultType: "sale" | "expense" | "payment" | "stock_intake" | "product" | "customer";
  message: string;
};

// ── 1. INTERPRET ─────────────────────────────────────────────────────────────

export async function interpretInput(
  userId: string,
  input: { type: "text"; text: string } | { type: "audio"; audio: Uint8Array; mimeType: string },
): Promise<InterpretResult> {
  const context = await buildAIContext(userId);

  let provider;
  try {
    provider = getAIProvider();
  } catch (err) {
    if (err instanceof AIUnavailableError) {
      return {
        sessionId: "none",
        status: "FAILED",
        transcript: input.type === "text" ? input.text : null,
        intent: "UNKNOWN",
        message: "Smart Entry is not configured. Set GEMINI_API_KEY.",
      };
    }
    throw err;
  }

  let interpretation: AiInterpretation;
  let transcript: string | null = null;

  try {
    if (input.type === "text") {
      interpretation = await provider.interpretText(input.text, context);
      transcript = input.text;
    } else {
      if (input.audio.byteLength > MAX_AUDIO_BYTES) {
        throw new BadRequestError("Audio too large (max 5MB).");
      }
      const result = await provider.transcribeAndInterpret(input.audio, input.mimeType, context);
      interpretation = result.interpretation;
      transcript = result.transcript;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[smart-entry] AI error:", errMsg);
    // Return a FORM with empty data so user can fill manually
    const session = await prisma.smartEntrySession.create({
      data: {
        userId, status: "AWAITING_CONFIRMATION",
        inputType: input.type,
        transcript: input.type === "text" ? input.text : transcript,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    const { customers, products } = await loadUserCustomersAndProducts(userId);
    return {
      sessionId: session.id, status: "FORM",
      transcript: input.type === "text" ? input.text : transcript,
      intent: "UNKNOWN",
      clarification: {
        question: "I couldn't process that. Please try again or type your request below.",
        suggestions: ["Ahmad bought 25 kg rice", "Add a product called sugar", "Ahmad paid me 5000"],
      },
      form: undefined,
    };
  }

  const parsed = aiInterpretationSchema.safeParse(interpretation);
  if (!parsed.success) {
    const session = await prisma.smartEntrySession.create({
      data: { userId, status: "AWAITING_CONFIRMATION", inputType: input.type, transcript, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { sessionId: session.id, status: "FORM", transcript, intent: "UNKNOWN", clarification: { question: "I couldn't understand that.", suggestions: [] } };
  }
  const ai = parsed.data;

  // ── Route by intent ───────────────────────────────────────────────────────
  if (ai.intent === "CREATE_EXPENSE") return await buildExpenseForm(userId, ai, transcript, input.type);
  if (ai.intent === "RECORD_PAYMENT") return await buildPaymentForm(userId, ai, transcript, input.type);
  if (ai.intent === "QUERY") return await processQuery(userId, ai, transcript);
  if (ai.intent === "STOCK_INTAKE") return await buildStockIntakeForm(userId, ai, transcript, input.type);
  if (ai.intent === "CREATE_PRODUCT") return await buildProductCreationForm(userId, ai, transcript, input.type);
  if (ai.intent === "CREATE_CUSTOMER") return await buildCustomerCreationForm(userId, ai, transcript, input.type);
  if (ai.intent === "UNKNOWN") return await buildClarificationForm(userId, ai, transcript, input.type);

  // CREATE_CREDIT_SALE → sale form
  return await buildSaleForm(userId, ai, transcript, input.type, provider.name);
}

// ── Sale form builder ────────────────────────────────────────────────────────

async function buildSaleForm(userId: string, ai: AiInterpretation, transcript: string | null, inputType: string, providerName: string): Promise<InterpretResult> {
  let resolvedCustomerId: string | null = null;
  if (ai.customerName) {
    const matches = await findCustomerCandidates(userId, ai.customerName);
    if (matches.length === 1) resolvedCustomerId = matches[0]!.id;
  }

  let resolvedProductId: string | null = null;
  if (ai.productName) {
    const matches = await findProductCandidates(userId, ai.productName);
    if (matches.length === 1) resolvedProductId = matches[0]!.id;
  }

  let resolvedBatchId: string | null = null;
  let batchCandidates: FormFieldState["batchCandidates"] = [];
  let batchSelectionRequired = false;

  if (resolvedProductId) {
    const batches = await prisma.stockMove.findMany({
      where: { productId: resolvedProductId, userId, voidedAt: null, type: { in: ["purchase", "return"] }, remainingQuantity: { gt: 0 } },
      orderBy: { date: "desc" },
      select: { id: true, reason: true, remainingQuantity: true, unitCost: true, date: true },
    });
    batchCandidates = batches.map((b) => ({ id: b.id, batchName: b.reason, remainingQuantity: b.remainingQuantity.toString(), unitCost: b.unitCost ? b.unitCost.toString() : null, date: b.date }));
    // Single batch auto-selects
    if (batches.length === 1) resolvedBatchId = batches[0]!.id;
    else if (batches.length > 1) batchSelectionRequired = true;
  }

  const { customers, products } = await loadUserCustomersAndProducts(userId);
  const isNewCustomer = !!ai.customerName && !resolvedCustomerId && ai.customerName.length > 0;
  const isNewProduct = !!ai.productName && !resolvedProductId && ai.productName.length > 0;

  const resolvedProduct = resolvedProductId ? products.find((p) => p.id === resolvedProductId) : null;
  const defaultUnitPrice = resolvedProduct?.sellingPrice ? Number(resolvedProduct.sellingPrice) : null;

  let unitPrice: number | null = null;
  let totalAmount: number | null = null;
  let priceSource = "NONE";
  let priceConflict: FormFieldState["priceConflict"] = null;
  const qty = ai.quantity ?? null;

  if (ai.explicitUnitPrice != null && ai.explicitTotal != null && qty != null) {
    const calcTotal = qty * ai.explicitUnitPrice;
    if (Math.abs(calcTotal - ai.explicitTotal) > Math.max(calcTotal * 0.01, 1)) {
      priceConflict = { unitPrice: ai.explicitUnitPrice, total: ai.explicitTotal, calculatedTotal: calcTotal };
      unitPrice = ai.explicitTotal / qty;
      totalAmount = ai.explicitTotal;
      priceSource = "CONFLICT_RESOLVED";
    } else {
      unitPrice = ai.explicitUnitPrice;
      totalAmount = ai.explicitTotal;
      priceSource = "USER_UNIT_PRICE";
    }
  } else if (ai.explicitTotal != null && qty != null) {
    unitPrice = ai.explicitTotal / qty;
    totalAmount = ai.explicitTotal;
    priceSource = "USER_TOTAL";
  } else if (ai.explicitUnitPrice != null && qty != null) {
    unitPrice = ai.explicitUnitPrice;
    totalAmount = qty * ai.explicitUnitPrice;
    priceSource = "USER_UNIT_PRICE";
  } else if (defaultUnitPrice != null && qty != null) {
    unitPrice = defaultUnitPrice;
    totalAmount = qty * defaultUnitPrice;
    priceSource = "DEFAULT_PRODUCT_PRICE";
  }

  let paidAmount: number;
  let balance: number | null;
  if (totalAmount != null) {
    if (ai.explicitPaidAmount == null) { paidAmount = totalAmount; balance = 0; }
    else { paidAmount = ai.explicitPaidAmount; balance = totalAmount - paidAmount; }
  } else {
    paidAmount = ai.explicitPaidAmount ?? 0;
    balance = null;
  }

  const session = await prisma.smartEntrySession.create({
    data: {
      userId, status: "AWAITING_CONFIRMATION", inputType,
      transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent,
      customerNameRaw: ai.customerName, productNameRaw: ai.productName,
      quantityRaw: ai.quantity ?? null, unitRaw: ai.unit ?? null,
      resolvedCustomerId, resolvedProductId,
      resolvedUnitPrice: unitPrice != null ? new Decimal(unitPrice) : null,
      resolvedAmount: totalAmount != null ? new Decimal(totalAmount) : null,
      provider: providerName, confidence: ai.confidence ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id, status: "FORM", transcript, intent: ai.intent,
    form: {
      customerNameRaw: ai.customerName, productNameRaw: ai.productName,
      quantityRaw: ai.quantity ?? null, unitRaw: ai.unit ?? null,
      batchNameRaw: ai.batchName ?? null,
      explicitUnitPrice: ai.explicitUnitPrice ?? null, explicitTotal: ai.explicitTotal ?? null,
      explicitPaidAmount: ai.explicitPaidAmount ?? null,
      resolvedCustomerId, resolvedProductId, resolvedBatchId,
      batchCandidates, batchSelectionRequired,
      unitPrice, totalAmount, priceSource, paidAmount, balance, priceConflict,
      isNewCustomer, isNewProduct,
      customerCandidates: customers, productCandidates: products,
      hint: null,
    },
  };
}

// ── Expense form ─────────────────────────────────────────────────────────────

async function buildExpenseForm(userId: string, ai: AiInterpretation, transcript: string | null, inputType: string): Promise<InterpretResult> {
  const session = await prisma.smartEntrySession.create({
    data: { userId, status: "AWAITING_CONFIRMATION", inputType, transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return {
    sessionId: session.id, status: "FORM", transcript, intent: ai.intent,
    expenseForm: {
      expenseName: ai.expenseName ?? ai.productName ?? null,
      amount: ai.explicitTotal ?? ai.explicitUnitPrice ?? null,
      category: ai.expenseCategory ?? "other",
      notes: transcript, date: new Date().toISOString(),
    },
  };
}

// ── Payment form ─────────────────────────────────────────────────────────────

async function buildPaymentForm(userId: string, ai: AiInterpretation, transcript: string | null, inputType: string): Promise<InterpretResult> {
  let resolvedCustomerId: string | null = null;
  if (ai.customerName) {
    const matches = await findCustomerCandidates(userId, ai.customerName);
    if (matches.length === 1) resolvedCustomerId = matches[0]!.id;
  }
  const { customers } = await loadUserCustomersAndProducts(userId);
  const isNewCustomer = !!ai.customerName && !resolvedCustomerId && ai.customerName.length > 0;

  let customerBalance: string | null = null;
  if (resolvedCustomerId) {
    const customer = await prisma.customer.findFirst({ where: { id: resolvedCustomerId, userId, isDeleted: false }, select: { openingBalance: true } });
    if (customer) {
      const [salesAgg, paymentsAgg, adjustmentsAgg] = await Promise.all([
        prisma.sale.aggregate({ _sum: { totalAmount: true }, where: { customerId: resolvedCustomerId, userId, voidedAt: null } }),
        prisma.payment.aggregate({ _sum: { amount: true }, where: { customerId: resolvedCustomerId, userId, voidedAt: null } }),
        prisma.customerAdjustment.aggregate({ _sum: { amount: true }, where: { customerId: resolvedCustomerId, userId, voidedAt: null } }),
      ]);
      const opening = toDecimalOrZero(customer.openingBalance);
      const sales = toDecimalOrZero(salesAgg._sum.totalAmount);
      const payments = toDecimalOrZero(paymentsAgg._sum.amount);
      const adjustments = toDecimalOrZero(adjustmentsAgg._sum.amount);
      customerBalance = opening.plus(sales).minus(payments).plus(adjustments).toString();
    }
  }

  const session = await prisma.smartEntrySession.create({
    data: { userId, status: "AWAITING_CONFIRMATION", inputType, transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent, customerNameRaw: ai.customerName, resolvedCustomerId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });

  return {
    sessionId: session.id, status: "FORM", transcript, intent: ai.intent,
    paymentForm: {
      customerNameRaw: ai.customerName, resolvedCustomerId,
      amount: ai.explicitPaidAmount ?? null, method: "cash",
      notes: null, date: new Date().toISOString(),
      isNewCustomer, customerCandidates: customers, customerBalance,
    },
  };
}

// ── Query ────────────────────────────────────────────────────────────────────

async function processQuery(userId: string, ai: AiInterpretation, transcript: string | null): Promise<InterpretResult> {
  const queryType = ai.queryType ?? "OTHER";
  const queryEntity = ai.queryEntity ?? null;
  const dateRange = ai.queryDateRange ?? "today";
  let resultText = "";
  let resultData: unknown = null;

  if (queryType === "TODAYS_EXPENSES" || queryType === "EXPENSES_SUMMARY") {
    const agg = await prisma.expense.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { userId, voidedAt: null } });
    resultText = `Total expenses: Rs. ${Number(agg._sum.amount ?? 0).toLocaleString()} (${agg._count._all} expenses)`;
    resultData = { total: agg._sum.amount?.toString() ?? "0", count: agg._count._all };
  } else if (queryType === "CUSTOMER_BALANCES") {
    const customers = await prisma.customer.findMany({ where: { userId, isDeleted: false }, select: { id: true, name: true, openingBalance: true } });
    const balances = await Promise.all(customers.map(async (c) => {
      const s = await prisma.sale.aggregate({ _sum: { totalAmount: true }, where: { customerId: c.id, userId, voidedAt: null } });
      const p = await prisma.payment.aggregate({ _sum: { amount: true }, where: { customerId: c.id, userId, voidedAt: null } });
      return { name: c.name, balance: Number(c.openingBalance) + Number(s._sum.totalAmount ?? 0) - Number(p._sum.amount ?? 0) };
    }));
    const owing = balances.filter((b) => b.balance > 0);
    resultText = owing.length > 0 ? `${owing.length} customers owe you Rs. ${owing.reduce((s, b) => s + b.balance, 0).toLocaleString()}` : "No customers owe you money.";
    resultData = owing;
  } else if (queryType === "STOCK_LEVEL" && queryEntity) {
    const product = await prisma.product.findFirst({ where: { userId, isDeleted: false, name: { contains: queryEntity, mode: "insensitive" } }, select: { id: true, name: true, openingStock: true } });
    if (product) {
      const moves = await prisma.stockMove.aggregate({ _sum: { quantity: true }, where: { productId: product.id, userId, voidedAt: null } });
      const sold = await prisma.saleItem.aggregate({ _sum: { quantity: true }, where: { productId: product.id, sale: { userId, voidedAt: null } } });
      const stock = Number(product.openingStock) + Number(moves._sum.quantity ?? 0) - Number(sold._sum.quantity ?? 0);
      resultText = `Stock of ${product.name}: ${stock} units.`;
      resultData = { product: product.name, stock };
    } else { resultText = `Product "${queryEntity}" not found.`; }
  } else {
    resultText = "I can check expenses, sales, customer balances, and stock levels. What would you like to know?";
  }

  const session = await prisma.smartEntrySession.create({ data: { userId, status: "AWAITING_CONFIRMATION", inputType: "text", transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  return { sessionId: session.id, status: "FORM", transcript, intent: ai.intent, queryResult: { queryType, queryEntity, queryDateRange: dateRange, result: resultText, data: resultData } };
}

// ── Stock intake form ───────────────────────────────────────────────────────

async function buildStockIntakeForm(userId: string, ai: AiInterpretation, transcript: string | null, inputType: string): Promise<InterpretResult> {
  let resolvedProductId: string | null = null;
  if (ai.productName) {
    const matches = await findProductCandidates(userId, ai.productName);
    if (matches.length === 1) resolvedProductId = matches[0]!.id;
  }
  const { products } = await loadUserCustomersAndProducts(userId);
  const isNewProduct = !!ai.productName && !resolvedProductId && ai.productName.length > 0;
  const session = await prisma.smartEntrySession.create({ data: { userId, status: "AWAITING_CONFIRMATION", inputType, transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent, productNameRaw: ai.productName, resolvedProductId, quantityRaw: ai.quantity ?? null, unitRaw: ai.unit ?? null, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  return {
    sessionId: session.id, status: "FORM", transcript, intent: ai.intent,
    stockIntakeForm: {
      productNameRaw: ai.productName, resolvedProductId,
      quantity: ai.quantity ?? null, unit: ai.unit ?? null,
      unitCost: ai.explicitUnitPrice ?? null, batchName: ai.batchName ?? null,
      date: new Date().toISOString(), isNewProduct, productCandidates: products,
    },
  };
}

// ── Product creation form ────────────────────────────────────────────────────

async function buildProductCreationForm(userId: string, ai: AiInterpretation, transcript: string | null, inputType: string): Promise<InterpretResult> {
  const mentionedStock = ai.quantity != null && ai.quantity > 0;
  const aiPrice = ai.explicitUnitPrice ?? null;
  const session = await prisma.smartEntrySession.create({ data: { userId, status: "AWAITING_CONFIRMATION", inputType, transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent, productNameRaw: ai.productName, quantityRaw: ai.quantity ?? null, unitRaw: ai.unit ?? null, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  return {
    sessionId: session.id, status: "FORM", transcript, intent: ai.intent,
    productCreationForm: {
      name: ai.productName ?? null, unit: ai.unit ?? null, category: null, sku: null,
      purchasePrice: aiPrice, sellingPrice: aiPrice,
      openingStock: mentionedStock ? ai.quantity : null, lowStockThreshold: 5,
      hint: !ai.productName ? "Enter the product name." : !ai.unit ? "Enter the unit." : aiPrice == null ? "Enter purchase and selling prices." : null,
      mentionedStock,
    },
  };
}

// ── Customer creation form ────────────────────────────────────────────────────

async function buildCustomerCreationForm(userId: string, ai: AiInterpretation, transcript: string | null, inputType: string): Promise<InterpretResult> {
  const openingBalance = ai.explicitTotal ?? ai.explicitPaidAmount ?? null;
  const session = await prisma.smartEntrySession.create({ data: { userId, status: "AWAITING_CONFIRMATION", inputType, transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent, customerNameRaw: ai.customerName, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  return {
    sessionId: session.id, status: "FORM", transcript, intent: ai.intent,
    customerCreationForm: {
      name: ai.customerName ?? null, phone: null, address: null, notes: null,
      openingBalance, hint: null,
    },
  };
}

// ── Clarification (UNKNOWN intent) ──────────────────────────────────────────

async function buildClarificationForm(userId: string, ai: AiInterpretation, transcript: string | null, inputType: string): Promise<InterpretResult> {
  const question = ai.clarificationQuestion?.trim() || "I didn't understand. Try: \"Ahmad bought 25 kg rice\" or \"Add a product called sugar\".";
  const session = await prisma.smartEntrySession.create({ data: { userId, status: "AWAITING_CONFIRMATION", inputType, transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  return {
    sessionId: session.id, status: "FORM", transcript, intent: ai.intent,
    clarification: { question, suggestions: ["Ahmad bought 25 kg rice", "Add a product called sugar", "Ahmad paid me 5000", "I spent 200 on tea"] },
  };
}

// ── 2. EXECUTE ───────────────────────────────────────────────────────────────

export async function executeSession(userId: string, input: {
  sessionId: string; customerId: string; productId: string; quantity: number;
  unitPrice?: number; paidAmount?: number; batchId?: string;
}): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED" && session.createdSaleId) {
    const existing = await prisma.sale.findFirst({ where: { id: session.createdSaleId, userId }, select: { id: true, totalAmount: true, outstanding: true } });
    if (existing) return { saleId: existing.id, totalAmount: existing.totalAmount.toString(), outstanding: existing.outstanding.toString(), resultType: "sale", message: `Already added — Rs. ${Number(existing.totalAmount).toLocaleString()}` };
    throw new BadRequestError("This entry was already processed but its sale no longer exists.");
  }
  const claimed = await prisma.smartEntrySession.updateMany({ where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" }, data: { status: "EXECUTING", updatedAt: new Date() } });
  if (claimed.count === 0) {
    const current = await prisma.smartEntrySession.findFirst({ where: { id: input.sessionId, userId }, select: { status: true } });
    if (current?.status === "EXECUTING") throw new BadRequestError("Already being processed. Please wait.");
    throw new BadRequestError(`Session is in ${current?.status ?? "unknown"} state.`);
  }
  try {
    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "EXPIRED", completedAt: new Date() } });
      throw new BadRequestError("This entry has expired. Please try again.");
    }
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, userId, isDeleted: false } });
    if (!customer) throw new NotFoundError("Customer");
    const product = await prisma.product.findFirst({ where: { id: input.productId, userId, isDeleted: false } });
    if (!product) throw new NotFoundError("Product");
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new BadRequestError("Quantity must be positive.");

    const finalUnitPrice = input.unitPrice != null && input.unitPrice > 0 ? toDecimal(input.unitPrice) : toDecimal(product.sellingPrice);
    const amount = new Decimal(input.quantity).times(finalUnitPrice);
    const paidAmountDec = new Decimal(input.paidAmount ?? 0);
    if (paidAmountDec.gt(amount)) throw new BadRequestError(`Paid amount (${paidAmountDec}) cannot exceed sale total (${amount}).`);

    const sale = await createSale({ customerId: customer.id, items: [{ productId: product.id, quantity: input.quantity, unitPrice: finalUnitPrice.toNumber(), batchId: input.batchId }], paidAmount: paidAmountDec.toNumber(), paymentMethod: "cash" }, userId);
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "COMPLETED", completedAt: new Date(), createdSaleId: sale.id, resolvedCustomerId: customer.id, resolvedProductId: product.id, resolvedUnit: product.unit, resolvedQuantity: new Decimal(input.quantity), resolvedUnitPrice: finalUnitPrice, resolvedAmount: amount } });
    invalidateCache("dashboard"); invalidateCache("customers"); invalidateCache("products"); invalidateCache("sales");
    return { saleId: sale.id, totalAmount: sale.totalAmount, outstanding: sale.outstanding, resultType: "sale", message: `Added to Khata — Rs. ${Number(sale.totalAmount).toLocaleString()}` };
  } catch (error) {
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => {});
    throw error;
  }
}

export async function executeExpenseSession(userId: string, input: { sessionId: string; expenseName: string; amount: number; category: string; notes?: string | null; date?: string }): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") throw new BadRequestError("Already processed.");
  const claimed = await prisma.smartEntrySession.updateMany({ where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" }, data: { status: "EXECUTING", updatedAt: new Date() } });
  if (claimed.count === 0) throw new BadRequestError("Session cannot be executed.");
  try {
    const expense = await recordExpense({ name: input.expenseName, amount: input.amount, category: input.category, notes: input.notes ?? null, date: input.date }, userId);
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "COMPLETED", completedAt: new Date() } });
    invalidateCache("dashboard"); invalidateCache("expenses");
    return { expenseId: expense.id, resultType: "expense", message: `Expense recorded: ${expense.name} — Rs. ${Number(expense.amount).toLocaleString()}` };
  } catch (error) {
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => {});
    throw error;
  }
}

export async function executePaymentSession(userId: string, input: { sessionId: string; customerId: string; amount: number; method?: string; notes?: string | null; date?: string }): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") throw new BadRequestError("Already processed.");
  const claimed = await prisma.smartEntrySession.updateMany({ where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" }, data: { status: "EXECUTING", updatedAt: new Date() } });
  if (claimed.count === 0) throw new BadRequestError("Session cannot be executed.");
  try {
    const payment = await recordPayment({ customerId: input.customerId, amount: input.amount, method: (input.method ?? "cash") as "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other", notes: input.notes ?? null, date: input.date }, userId);
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "COMPLETED", completedAt: new Date(), resolvedCustomerId: input.customerId } });
    invalidateCache("dashboard"); invalidateCache("customers"); invalidateCache("payments");
    return { paymentId: payment.id, resultType: "payment", message: `Payment recorded: Rs. ${Number(payment.amount).toLocaleString()} from ${payment.customerName}` };
  } catch (error) {
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => {});
    throw error;
  }
}

export async function executeStockIntakeSession(userId: string, input: { sessionId: string; productId: string; quantity: number; unitCost?: number; batchName?: string | null; date?: string }): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") throw new BadRequestError("Already processed.");
  const claimed = await prisma.smartEntrySession.updateMany({ where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" }, data: { status: "EXECUTING", updatedAt: new Date() } });
  if (claimed.count === 0) throw new BadRequestError("Session cannot be executed.");
  try {
    const move = await addStockMove({ productId: input.productId, type: "purchase", quantity: input.quantity, unitCost: input.unitCost ?? null, reason: input.batchName ?? null, date: input.date }, userId);
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "COMPLETED", completedAt: new Date(), resolvedProductId: input.productId } });
    invalidateCache("dashboard"); invalidateCache("products"); invalidateCache("stock");
    return { resultType: "stock_intake", message: `Stock added: ${input.quantity} units${move.reason ? ` (${move.reason})` : ""}` };
  } catch (error) {
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => {});
    throw error;
  }
}

export async function executeProductCreationSession(userId: string, input: { sessionId: string; name: string; unit: string; purchasePrice: number; sellingPrice: number; openingStock?: number; lowStockThreshold?: number; category?: string | null; sku?: string | null }): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") throw new BadRequestError("Already processed.");
  const claimed = await prisma.smartEntrySession.updateMany({ where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" }, data: { status: "EXECUTING", updatedAt: new Date() } });
  if (claimed.count === 0) throw new BadRequestError("Session cannot be executed.");
  try {
    const product = await createProduct({ name: input.name, unit: input.unit, purchasePrice: input.purchasePrice, sellingPrice: input.sellingPrice, openingStock: input.openingStock ?? 0, lowStockThreshold: input.lowStockThreshold ?? 5, category: input.category ?? null, sku: input.sku ?? null }, userId);
    // If opening stock was provided, create a stock move for it
    if (input.openingStock && input.openingStock > 0) {
      await addStockMove({ productId: product.id, type: "purchase", quantity: input.openingStock, unitCost: input.purchasePrice, reason: "Opening stock" }, userId);
    }
    const result = { product };
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "COMPLETED", completedAt: new Date(), resolvedProductId: result.product.id } });
    invalidateCache("dashboard"); invalidateCache("products"); invalidateCache("stock");
    return { productId: result.product.id, resultType: "product", message: `Product created: ${result.product.name}` };
  } catch (error) {
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => {});
    throw error;
  }
}

export async function executeCustomerCreationSession(userId: string, input: { sessionId: string; name: string; phone?: string | null; address?: string | null; notes?: string | null; openingBalance?: number }): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") throw new BadRequestError("Already processed.");
  const claimed = await prisma.smartEntrySession.updateMany({ where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" }, data: { status: "EXECUTING", updatedAt: new Date() } });
  if (claimed.count === 0) throw new BadRequestError("Session cannot be executed.");
  try {
    const customer = await createCustomer({ name: input.name, phone: input.phone ?? null, address: input.address ?? null, notes: input.notes ?? null, openingBalance: input.openingBalance ?? 0 }, userId);
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "COMPLETED", completedAt: new Date(), resolvedCustomerId: customer.id } });
    invalidateCache("dashboard"); invalidateCache("customers");
    return { customerId: customer.id, resultType: "customer", message: `Customer added: ${customer.name}` };
  } catch (error) {
    await prisma.smartEntrySession.update({ where: { id: input.sessionId }, data: { status: "FAILED", completedAt: new Date() } }).catch(() => {});
    throw error;
  }
}

// ── 3. CANCEL ────────────────────────────────────────────────────────────────

export async function cancelSession(userId: string, sessionId: string): Promise<{ id: string; cancelled: true }> {
  const session = await loadAndVerifySession(userId, sessionId);
  if (session.status === "COMPLETED") throw new BadRequestError("Cannot cancel a completed session.");
  await prisma.smartEntrySession.update({ where: { id: sessionId }, data: { status: "CANCELLED", completedAt: new Date() } });
  return { id: sessionId, cancelled: true };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadAndVerifySession(userId: string, sessionId: string) {
  const session = await prisma.smartEntrySession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new NotFoundError("Smart Entry Session", sessionId);
  return session;
}

async function buildAIContext(userId: string): Promise<AIContext> {
  const [customers, products, settings] = await Promise.all([
    prisma.customer.findMany({ where: { userId, isDeleted: false }, select: { name: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.product.findMany({ where: { userId, isDeleted: false }, select: { name: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.setting.findUnique({ where: { id: "singleton" }, select: { customUnits: true } }),
  ]);
  const defaultUnits = ["kg", "piece", "box", "bag", "dozen", "litre", "metre"];
  const customUnits = settings?.customUnits ?? [];
  return { customerNames: customers.map((c) => c.name), productNames: products.map((p) => p.name), units: Array.from(new Set([...defaultUnits, ...customUnits])) };
}

async function loadUserCustomersAndProducts(userId: string): Promise<{ customers: EntityCandidate[]; products: EntityCandidate[] }> {
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ where: { userId, isDeleted: false }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.product.findMany({ where: { userId, isDeleted: false }, select: { id: true, name: true, unit: true, sellingPrice: true }, orderBy: { name: "asc" }, take: 200 }),
  ]);
  return {
    customers: customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null })),
    products: products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, sellingPrice: p.sellingPrice.toString() })),
  };
}

async function findCustomerCandidates(userId: string, name: string): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  const cleanName = name.trim();
  if (!cleanName) return [];
  const exact = await prisma.customer.findMany({ where: { userId, isDeleted: false, name: { equals: cleanName, mode: "insensitive" } }, select: { id: true, name: true, phone: true }, take: 6 });
  if (exact.length > 0) return exact;
  const contains = await prisma.customer.findMany({ where: { userId, isDeleted: false, name: { contains: cleanName, mode: "insensitive" } }, select: { id: true, name: true, phone: true }, take: 6 });
  return contains;
}

async function findProductCandidates(userId: string, name: string): Promise<Array<{ id: string; name: string; unit: string; sellingPrice: Decimal }>> {
  const cleanName = name.trim();
  if (!cleanName) return [];
  const exact = await prisma.product.findMany({ where: { userId, isDeleted: false, name: { equals: cleanName, mode: "insensitive" } }, select: { id: true, name: true, unit: true, sellingPrice: true }, take: 6 });
  if (exact.length > 0) return exact;
  const contains = await prisma.product.findMany({ where: { userId, isDeleted: false, name: { contains: cleanName, mode: "insensitive" } }, select: { id: true, name: true, unit: true, sellingPrice: true }, take: 6 });
  return contains;
}
