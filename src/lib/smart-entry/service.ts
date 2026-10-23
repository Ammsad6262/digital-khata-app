/**
 * Smart Khata Entry — service layer (V2: editable-form architecture).
 *
 * KEY CHANGE FROM V1:
 *   V1: interpret returns READY / CLARIFICATION_NEEDED / AMBIGUOUS_CUSTOMER /
 *       AMBIGUOUS_PRODUCT / FAILED — each maps to a different UI. Partial
 *       input triggered FAILED → user saw "Something went wrong".
 *   V2: interpret returns FORM (with pre-filled fields + candidates) or FAILED
 *       (only for genuine infrastructure failures). The UI always shows an
 *       editable form. Partial input is normal — the user completes missing
 *       fields manually.
 *
 * Flow:
 *   1. User speaks/types → /interpret
 *   2. AI returns whatever it understood (may be partial)
 *   3. Backend resolves customer/product names against THIS USER's records
 *   4. Backend returns FORM status with:
 *      - transcript (what user said)
 *      - extracted fields (customerName, productName, quantity, unit)
 *      - resolvedCustomerId (if exactly 1 match) OR customerCandidates
 *      - resolvedProductId (if exactly 1 match) OR productCandidates
 *      - all of the user's customers + products (for the searchable pickers)
 *   5. UI shows editable form pre-filled with whatever was understood
 *   6. User reviews/edits → clicks "Add to Khata" → /execute
 *   7. /execute re-validates everything server-side, computes amount, calls
 *      existing SaleService.createSale()
 */

import { prisma } from "@/lib/db/prisma";
import { Decimal, toDecimal, toDecimalOrZero } from "@/lib/utils/decimal";
import { BadRequestError, NotFoundError, AppError, ErrorCode } from "@/lib/errors";
import { createSale } from "@/lib/services/sales";
import { recordExpense } from "@/lib/services/expenses";
import { recordPayment } from "@/lib/services/payments";
import { addStockMove } from "@/lib/services/stock";
import { createProductWithOpeningStock } from "@/lib/services/products";
import {
  createCustomer,
  getCustomerBalance,
  listOutstandingCustomers,
} from "@/lib/services/customers";
import { listSuppliersWithBalance } from "@/lib/services/suppliers";
import { createSupplierPayment } from "@/lib/services/supplier-payments";
import { createPurchase } from "@/lib/services/purchases";
import { listReminders, getReminderCounts, createReminder } from "@/lib/services/reminders";
import { getBusinessInsights } from "@/lib/services/insights";
import { getFollowUpCandidates } from "@/lib/services/follow-ups";
import { invalidateCache } from "@/lib/utils/cache";
import { tServer } from "@/lib/i18n/server";
import { getAIProvider, AIUnavailableError } from "./gemini-provider";
import type { AIContext } from "./ai-provider";
import {
  aiInterpretationSchema,
  type AiInterpretation,
  type EntityCandidate,
  type InterpretStatus,
} from "./schema";
import type { Prisma } from "@prisma/client";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

function aiToPrismaJson(ai: AiInterpretation): Prisma.InputJsonValue {
  return ai as unknown as Prisma.InputJsonValue;
}

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type FormFieldState = {
  // Raw AI-extracted values (for display "AI heard: ...")
  customerNameRaw: string | null;
  productNameRaw: string | null;
  quantityRaw: number | null;
  unitRaw: string | null;
  // V2: Batch name extracted by AI (e.g. "Old Rice")
  batchNameRaw: string | null;

  // V3: Price fields extracted by AI
  explicitUnitPrice: number | null;
  explicitTotal: number | null;
  // V4: Payment amount extracted by AI
  explicitPaidAmount: number | null;

  // Resolved by BACKEND — pre-fill the form if exactly 1 match
  resolvedCustomerId: string | null;
  resolvedProductId: string | null;
  // V5: Resolved batch ID (if AI named a batch that matches exactly 1)
  resolvedBatchId: string | null;
  // V5: Available batches for the resolved product (for the batch picker)
  batchCandidates: Array<{
    id: string;
    batchName: string | null;
    remainingQuantity: string;
    unitCost: string | null;
    date: Date;
  }>;
  // V5: Whether batch selection is required (product has 2+ eligible batches)
  batchSelectionRequired: boolean;

  // V3: Computed price fields (backend applies pricing priority)
  unitPrice: number | null;
  totalAmount: number | null;
  priceSource: "USER_TOTAL" | "USER_UNIT_PRICE" | "DEFAULT_PRODUCT_PRICE" | "MANUAL_INPUT" | "CONFLICT_RESOLVED" | "NONE";

  // V4: Payment + balance
  paidAmount: number | null;
  balance: number | null;

  // V3: If both unit price AND total were given but they conflict
  priceConflict: {
    unitPrice: number;
    total: number;
    calculatedTotal: number;
  } | null;

  // V3: New customer detection
  isNewCustomer: boolean;

  // V6: New product detection — set when AI extracted a productName but
  // backend found 0 matching products in the user's inventory. The UI uses
  // this to show the "X isn't in your products yet. Add it now?" prompt with
  // an inline 3-step AddProductWizard.
  isNewProduct: boolean;

  // All of the user's customers + products (for the searchable pickers)
  customerCandidates: EntityCandidate[];
  productCandidates: EntityCandidate[];

  // Helpful hint for the user
  hint: string | null;
};

// V10: Expense form state (for CREATE_EXPENSE intent)
export type ExpenseFormState = {
  expenseName: string | null;
  amount: number | null;
  category: string;
  notes: string | null;
  date: string | null;
};

// V10: Payment form state (for RECORD_PAYMENT intent)
export type PaymentFormState = {
  customerNameRaw: string | null;
  resolvedCustomerId: string | null;
  amount: number | null;
  method: string;
  notes: string | null;
  date: string | null;
  isNewCustomer: boolean;
  customerCandidates: EntityCandidate[];
  // V12: Customer's current outstanding balance (for display in PaymentFormView)
  // Positive = customer owes money. Null = unknown/not fetched.
  customerBalance: string | null;
};

// Supplier payment form state (for SUPPLIER_PAYMENT intent)
export type SupplierPaymentFormState = {
  supplierNameRaw: string | null;
  resolvedSupplierId: string | null;
  amount: number | null;
  method: string;
  notes: string | null;
  date: string;
  supplierBalance: string | null;
  supplierCandidates: EntityCandidate[];
};

// Reminder form state (for CREATE_REMINDER intent)
export type ReminderFormState = {
  title: string;
  notes: string | null;
  type: string;
  priority: string;
  dueAt: string;
  customerNameRaw: string | null;
  resolvedCustomerId: string | null;
  customerCandidates: EntityCandidate[];
};

// Purchase form state (for CREATE_PURCHASE intent)
export type PurchaseFormState = {
  supplierNameRaw: string | null;
  resolvedSupplierId: string | null;
  supplierCandidates: EntityCandidate[];
  productNameRaw: string | null;
  resolvedProductId: string | null;
  productCandidates: EntityCandidate[];
  quantity: number | null;
  unitCost: number | null;
  paidAmount: number;
  notes: string | null;
  date: string;
  supplierBalance: string | null;
};

// V10: Query result state (for QUERY intent)
export type QueryResultState = {
  queryType: string;
  queryEntity: string | null;
  queryDateRange: string | null;
  result: string;
  data: unknown;
};

// V11: Stock intake form state (for STOCK_INTAKE intent)
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

// V13: Product creation form state (for CREATE_PRODUCT intent)
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

// V13: Customer creation form state (for CREATE_CUSTOMER intent)
export type CustomerCreationFormState = {
  name: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  openingBalance: number | null;
  hint: string | null;
};

// V13: Clarification state (for UNKNOWN intent)
export type ClarificationState = {
  question: string;
  suggestions: string[];
};

export type InterpretResult = {
  sessionId: string;
  status: InterpretStatus;
  transcript: string | null;
  intent: string;
  form?: FormFieldState;
  expenseForm?: ExpenseFormState;
  paymentForm?: PaymentFormState;
  supplierPaymentForm?: SupplierPaymentFormState;
  reminderForm?: ReminderFormState;
  purchaseForm?: PurchaseFormState;
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
  // V10: Expense/Payment results
  expenseId?: string;
  paymentId?: string;
  productId?: string;
  customerId?: string;
  resultType: "sale" | "expense" | "payment" | "stock_intake" | "product" | "customer" | "supplier_payment" | "reminder" | "purchase";
  message: string;
};

// ────────────────────────────────────────────────────────────────────────────
// 1. INTERPRET — text or audio → editable form
// ────────────────────────────────────────────────────────────────────────────

export async function interpretInput(
  userId: string,
  input:
    | { type: "text"; text: string }
    | { type: "audio"; audio: Uint8Array; mimeType: string },
): Promise<InterpretResult> {
  // Build context (names only — never IDs sent to AI)
  const context = await buildAIContext(userId);

  // Call AI (with friendly failure if AI unavailable — geo-blocked dev env, etc.)
  let provider;
  try {
    provider = getAIProvider();
  } catch (err) {
    if (err instanceof AIUnavailableError) {
      console.error("[smart-entry] AI provider unavailable:", err.message);
      return {
        sessionId: "none",
        status: "FAILED",
        transcript: input.type === "text" ? input.text : null,
        intent: "UNKNOWN",
        message:
          "Smart Khata Entry is not configured. Please contact support to enable this feature.",
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
        throw new BadRequestError(
          "api.smartEntry.audioTooLarge",
          undefined,
          { max: String(MAX_AUDIO_BYTES / 1024 / 1024) },
        );
      }
      const result = await provider.transcribeAndInterpret(
        input.audio,
        input.mimeType,
        context,
      );
      interpretation = result.interpretation;
      transcript = result.transcript;
    }
  } catch (error) {
    // ── Surface the EXACT Google error ────────────────────────────────────
    // The user needs to see the real error code + message so they can diagnose
    // whether it's a geo-block (400), a bad model (404), an auth issue (401/403),
    // or a genuine internal error (500). We log the full error server-side and
    // return a sanitized version to the client.
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[smart-entry] Gemini API error (full):", errMsg);

    // Parse the Google error code from the error message
    let googleErrorCode: number | null = null;
    let googleErrorMessage: string = errMsg;
    try {
      // The @google/genai SDK throws ApiError with message = JSON string
      const parsed = JSON.parse(errMsg);
      if (parsed?.error?.code) googleErrorCode = parsed.error.code;
      if (parsed?.error?.message) googleErrorMessage = parsed.error.message;
    } catch {
      // Not JSON — use the raw message
    }

    console.error("[smart-entry] Gemini API error code:", googleErrorCode);
    console.error("[smart-entry] Gemini API error message:", googleErrorMessage);

    // Build a user-friendly hint based on the EXACT error
    let hint: string;
    if (googleErrorCode === 400 && googleErrorMessage.includes("User location is not supported")) {
      hint = "AI service is geo-blocked from this server. Deploy to Vercel (US region) or run locally from a supported country. You can still fill the form manually below.";
    } else if (googleErrorCode === 401 || googleErrorCode === 403) {
      hint = "Gemini API key is invalid or expired. Check GEMINI_API_KEY in .env. You can still fill the form manually below.";
    } else if (googleErrorCode === 404) {
      hint = `Gemini model not found: ${googleErrorMessage.slice(0, 100)}. Check that the model ID is current. You can still fill the form manually below.`;
    } else if (googleErrorCode === 429) {
      // 429 = rate limit / quota exhausted. NOT an "understanding" issue.
      // Show a friendly "temporarily busy" message, NOT "couldn't understand".
      hint = "The AI service is temporarily busy. Please wait a minute and try again. You can also fill the form manually below.";
    } else if (googleErrorCode === 500 || googleErrorCode === 503) {
      hint = "The AI service is temporarily unavailable. Please try again in a moment. You can also fill the form manually below.";
    } else {
      hint = `Gemini API error ${googleErrorCode ?? "(unknown)"}: ${googleErrorMessage.slice(0, 150)}. You can still fill the form manually below.`;
    }

    // Create a session row so the user can still fill the form manually
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "AWAITING_CONFIRMATION", // form is still editable
        inputType: input.type,
        transcript: input.type === "text" ? input.text : transcript,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    // Return FORM status with EMPTY form — user can fill it manually
    // even when AI failed entirely.
    const { customers, products } = await loadUserCustomersAndProducts(userId);
    return {
      sessionId: session.id,
      status: "FORM",
      transcript: input.type === "text" ? input.text : transcript,
      intent: "UNKNOWN",
      form: {
        customerNameRaw: null,
        productNameRaw: null,
        quantityRaw: null,
        unitRaw: null,
        batchNameRaw: null,
        explicitUnitPrice: null,
        explicitTotal: null,
        resolvedCustomerId: null,
        resolvedProductId: null,
        resolvedBatchId: null,
        batchCandidates: [],
        batchSelectionRequired: false,
        unitPrice: null,
        totalAmount: null,
        priceSource: "NONE",
        priceConflict: null,
        paidAmount: 0,
        balance: null,
        explicitPaidAmount: null,
        isNewCustomer: false,
        isNewProduct: false,
        customerCandidates: customers,
        productCandidates: products,
        hint,
      },
    };
  }

  // Validate AI output (defense-in-depth)
  const parsed = aiInterpretationSchema.safeParse(interpretation);
  if (!parsed.success) {
    console.error("[smart-entry] AI output failed schema validation:", parsed.error.issues);
    // Treat as partial — return an empty form. User fills manually.
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "AWAITING_CONFIRMATION",
        inputType: input.type,
        transcript,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    const { customers, products } = await loadUserCustomersAndProducts(userId);
    return {
      sessionId: session.id,
      status: "FORM",
      transcript,
      intent: "UNKNOWN",
      form: {
        customerNameRaw: null,
        productNameRaw: null,
        quantityRaw: null,
        unitRaw: null,
        batchNameRaw: null,
        explicitUnitPrice: null,
        explicitTotal: null,
        explicitPaidAmount: null,
        resolvedCustomerId: null,
        resolvedProductId: null,
        resolvedBatchId: null,
        batchCandidates: [],
        batchSelectionRequired: false,
        unitPrice: null,
        totalAmount: null,
        priceSource: "NONE",
        paidAmount: 0,
        balance: null,
        priceConflict: null,
        isNewCustomer: false,
        isNewProduct: false,
        customerCandidates: customers,
        productCandidates: products,
        hint: null,
      },
    };
  }
  const ai = parsed.data;

  // V10: Route by intent — only CREATE_CREDIT_SALE goes through the existing
  // sale form logic. Other intents get their own form builders.
  if (ai.intent === "CREATE_EXPENSE") {
    return await buildExpenseForm(userId, ai, transcript, input.type);
  }
  if (ai.intent === "RECORD_PAYMENT") {
    return await buildPaymentForm(userId, ai, transcript, input.type);
  }
  if (ai.intent === "QUERY") {
    return await processQuery(userId, ai, transcript);
  }
  if (ai.intent === "STOCK_INTAKE") {
    return await buildStockIntakeForm(userId, ai, transcript, input.type);
  }
  // V13: CREATE_PRODUCT → dedicated product creation form (NOT the sale form)
  if (ai.intent === "CREATE_PRODUCT") {
    return await buildProductCreationForm(userId, ai, transcript, input.type);
  }
  // V13: CREATE_CUSTOMER → dedicated customer creation form (NOT the sale form)
  if (ai.intent === "CREATE_CUSTOMER") {
    return await buildCustomerCreationForm(userId, ai, transcript, input.type);
  }
  // Stock bought from a named supplier (creates a payable)
  if (ai.intent === "CREATE_PURCHASE") {
    return await buildPurchaseForm(userId, ai, transcript, input.type);
  }
  // Money OUT to a supplier
  if (ai.intent === "SUPPLIER_PAYMENT") {
    return await buildSupplierPaymentForm(userId, ai, transcript, input.type);
  }
  // Follow-up / task
  if (ai.intent === "CREATE_REMINDER") {
    return await buildReminderForm(userId, ai, transcript, input.type);
  }
  // V13: UNKNOWN intent → clarification question (NOT the sale form)
  if (ai.intent === "UNKNOWN") {
    return await buildClarificationForm(userId, ai, transcript, input.type);
  }
  // CREATE_CREDIT_SALE falls through to the sale form logic below.

  // Resolve customer + product against THIS USER's records
  // (Pre-fill the form if exactly 1 match; otherwise leave empty for user to pick)
  let resolvedCustomerId: string | null = null;
  if (ai.customerName) {
    const matches = await findCustomerCandidates(userId, ai.customerName);
    if (matches.length === 1) {
      resolvedCustomerId = matches[0]!.id;
    }
    // If 0 or 2+ matches, leave resolvedCustomerId null — the user picks manually.
  }

  let resolvedProductId: string | null = null;
  if (ai.productName) {
    const matches = await findProductCandidates(userId, ai.productName);
    if (matches.length === 1) {
      resolvedProductId = matches[0]!.id;
    }
  }

  // V5: Resolve batch — if AI extracted a batchName AND product is resolved,
  // search for a matching StockMove batch for this product+user.
  // - If exactly 1 match → auto-select it (resolvedBatchId)
  // - If 0 matches → leave null (user picks manually or batch doesn't exist)
  // - If 2+ matches → leave null (ambiguous — user picks manually)
  let resolvedBatchId: string | null = null;
  let batchCandidates: FormFieldState["batchCandidates"] = [];
  let batchSelectionRequired = false;

  if (resolvedProductId) {
    // Fetch all eligible batches for this product (purchase + return, not voided, remaining > 0)
    const batches = await prisma.stockMove.findMany({
      where: {
        productId: resolvedProductId,
        userId,
        voidedAt: null,
        type: { in: ["purchase", "return"] },
        remainingQuantity: { gt: 0 },
      },
      orderBy: { date: "desc" }, // newest first
      select: {
        id: true,
        reason: true,
        remainingQuantity: true,
        unitCost: true,
        date: true,
      },
    });

    batchCandidates = batches.map((b) => ({
      id: b.id,
      batchName: b.reason,
      remainingQuantity: b.remainingQuantity.toString(),
      unitCost: b.unitCost ? b.unitCost.toString() : null,
      date: b.date,
    }));

    // If AI named a batch, try to match it
    if (ai.batchName) {
      const batchMatches = batches.filter(
        (b) => b.reason?.toLowerCase() === ai.batchName!.toLowerCase()
      );
      if (batchMatches.length === 1) {
        resolvedBatchId = batchMatches[0]!.id;
      }
      // If 0 or 2+ matches → leave null (user picks manually)
    }

    // Batch selection is required when:
    // - Product has 2+ eligible batches
    // - AND AI didn't resolve a specific batch
    // (If 1 batch → auto-selected below)
    if (batches.length > 1 && !resolvedBatchId) {
      batchSelectionRequired = true;
    }

    // If exactly 1 eligible batch and no batch was named → auto-select it
    if (batches.length === 1 && !resolvedBatchId) {
      resolvedBatchId = batches[0]!.id;
    }
  }

  // Load all user's customers + products for the searchable pickers
  const { customers, products } = await loadUserCustomersAndProducts(userId);

  // V3: Compute pricing priority + detect new customer
  const isNewCustomer = !!ai.customerName && !resolvedCustomerId && ai.customerName.length > 0;

  // V6: Detect new product — AI extracted a productName but backend found 0
  // matching products in the user's inventory. The UI uses this flag to show
  // the "X isn't in your products yet. Add it now?" prompt with an inline
  // 3-step AddProductWizard. (If 1 match → resolvedProductId is set; if 2+ →
  // productCandidates contains the matches for the user to pick from.)
  const isNewProduct = !!ai.productName && !resolvedProductId && ai.productName.length > 0;

  // V3: Resolve the product's default price (if exactly 1 product matched)
  const resolvedProduct = resolvedProductId
    ? products.find((p) => p.id === resolvedProductId)
    : null;
  const defaultUnitPrice = resolvedProduct?.sellingPrice
    ? Number(resolvedProduct.sellingPrice)
    : null;

  // V3: Apply PRICING PRIORITY
  //   1. explicitTotal → use it, compute unitPrice = total / qty
  //   2. explicitUnitPrice → use it, compute total = qty × unitPrice
  //   3. defaultUnitPrice (product.sellingPrice) → use it, compute total
  //   4. None → ask user for price (priceSource = NONE)
  //   5. If BOTH explicitUnitPrice AND explicitTotal → check for conflict
  let unitPrice: number | null = null;
  let totalAmount: number | null = null;
  let priceSource: FormFieldState["priceSource"] = "NONE";
  let priceConflict: FormFieldState["priceConflict"] = null;

  const qty = ai.quantity ?? null;

  if (ai.explicitUnitPrice != null && ai.explicitTotal != null && qty != null) {
    // BOTH given — check if they're consistent
    const calculatedTotal = qty * ai.explicitUnitPrice;
    const tolerance = Math.max(calculatedTotal * 0.01, 1); // 1% or 1 rupee tolerance
    if (Math.abs(calculatedTotal - ai.explicitTotal) > tolerance) {
      // CONFLICT — the user said both a unit price AND a total that don't match
      priceConflict = {
        unitPrice: ai.explicitUnitPrice,
        total: ai.explicitTotal,
        calculatedTotal,
      };
      // Default to the total (higher priority) but let the UI show the conflict
      unitPrice = ai.explicitTotal / qty;
      totalAmount = ai.explicitTotal;
      priceSource = "CONFLICT_RESOLVED";
    } else {
      // Consistent — use the explicit unit price
      unitPrice = ai.explicitUnitPrice;
      totalAmount = ai.explicitTotal;
      priceSource = "USER_UNIT_PRICE";
    }
  } else if (ai.explicitTotal != null && qty != null) {
    // PRIORITY 1: explicit total → compute unit price
    unitPrice = ai.explicitTotal / qty;
    totalAmount = ai.explicitTotal;
    priceSource = "USER_TOTAL";
  } else if (ai.explicitUnitPrice != null && qty != null) {
    // PRIORITY 2: explicit unit price → compute total
    unitPrice = ai.explicitUnitPrice;
    totalAmount = qty * ai.explicitUnitPrice;
    priceSource = "USER_UNIT_PRICE";
  } else if (defaultUnitPrice != null && qty != null) {
    // PRIORITY 3: default product price → compute total
    unitPrice = defaultUnitPrice;
    totalAmount = qty * defaultUnitPrice;
    priceSource = "DEFAULT_PRODUCT_PRICE";
  }
  // PRIORITY 4: None → priceSource stays "NONE", unitPrice/totalAmount stay null
  // The UI will show "Price: —" and the user can type it manually.

  // V4: Compute payment + balance
  //
  // DEFAULT-FULL-PAYMENT RULE (V7):
  //   When the user does NOT mention any payment amount, the app assumes the
  //   customer paid the FULL bill (paidAmount = totalAmount, balance = 0).
  //   This matches the shopkeeper convention: "Ahmad bought 25 kg rice" means
  //   Ahmad paid for it — it's a completed sale, not a credit sale.
  //
  //   When the user DOES mention a payment amount (explicitPaidAmount), we use
  //   that as a partial payment and compute the outstanding balance.
  //
  //   When the user explicitly says "on credit", "udhaar", "baad mein", "will
  //   pay later", "qarz" etc., the AI should set explicitPaidAmount = 0 (not
  //   null) to indicate "explicitly zero payment = credit sale".
  //
  //   The distinction:
  //     explicitPaidAmount === null  → no payment mentioned → DEFAULT FULL PAYMENT
  //     explicitPaidAmount === 0     → explicitly zero → CREDIT SALE (balance = total)
  //     explicitPaidAmount > 0        → partial payment → balance = total - paid
  //
  //   For the AI to distinguish these, the Gemini prompt rule says:
  //     "If the user did NOT mention a payment amount, return null."
  //     "If the user said 'on credit' or 'will pay later', return 0."
  //     "If the user said a specific amount, return that amount."
  let paidAmount: number;
  let balance: number | null;

  if (totalAmount != null) {
    if (ai.explicitPaidAmount == null) {
      // No payment mentioned → default full payment
      paidAmount = totalAmount;
      balance = 0;
    } else {
      // Explicit payment (could be 0 for credit, or > 0 for partial)
      paidAmount = ai.explicitPaidAmount;
      balance = totalAmount - paidAmount;
    }
  } else {
    // No total amount computed yet (missing price/qty) — can't default
    paidAmount = ai.explicitPaidAmount ?? 0;
    balance = null;
  }

  // Build a helpful hint based on what's missing
  const hint = buildHint(ai, priceSource, defaultUnitPrice);

  // Create the SmartEntrySession row (storing what AI heard + resolved IDs)
  const session = await prisma.smartEntrySession.create({
    data: {
      userId,
      status: "AWAITING_CONFIRMATION",
      inputType: input.type,
      transcript,
      rawAiResponse: aiToPrismaJson(ai),
      intent: ai.intent,
      customerNameRaw: ai.customerName,
      productNameRaw: ai.productName,
      quantityRaw: ai.quantity ?? null,
      unitRaw: ai.unit ?? null,
      // Note: batchName is NOT stored on SmartEntrySession — it's only in the
      // form response. The AI's batchName is in rawAiResponse (the full AI JSON).
      resolvedCustomerId,
      resolvedProductId,
      resolvedUnitPrice: unitPrice != null ? new Decimal(unitPrice) : null,
      resolvedAmount: totalAmount != null ? new Decimal(totalAmount) : null,
      provider: provider.name,
      confidence: ai.confidence ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id,
    status: "FORM",
    transcript,
    intent: ai.intent,
    form: {
      customerNameRaw: ai.customerName,
      productNameRaw: ai.productName,
      quantityRaw: ai.quantity ?? null,
      unitRaw: ai.unit ?? null,
      batchNameRaw: ai.batchName ?? null,
      explicitUnitPrice: ai.explicitUnitPrice ?? null,
      explicitTotal: ai.explicitTotal ?? null,
      explicitPaidAmount: ai.explicitPaidAmount ?? null,
      resolvedCustomerId,
      resolvedProductId,
      resolvedBatchId,
      batchCandidates,
      batchSelectionRequired,
      unitPrice,
      totalAmount,
      priceSource,
      paidAmount,
      balance,
      priceConflict,
      isNewCustomer,
      isNewProduct,
      customerCandidates: customers,
      productCandidates: products,
      hint,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// V10: Interpret for non-sale intents (expense, payment, query, etc.)
// ────────────────────────────────────────────────────────────────────────────

/**
 * V10: Process CREATE_EXPENSE intent.
 * Extracts expense fields from the AI interpretation and returns an
 * ExpenseFormState for the UI to render.
 */
async function buildExpenseForm(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
  inputType: string,
): Promise<InterpretResult> {
  const session = await prisma.smartEntrySession.create({
    data: {
      userId,
      status: "AWAITING_CONFIRMATION",
      inputType: inputType as "text" | "voice",
      transcript,
      rawAiResponse: aiToPrismaJson(ai),
      intent: ai.intent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id,
    status: "FORM",
    transcript,
    intent: ai.intent,
    expenseForm: {
      expenseName: ai.expenseName ?? ai.productName ?? null,
      amount: ai.explicitTotal ?? ai.explicitUnitPrice ?? null,
      category: ai.expenseCategory ?? "other",
      notes: transcript,
      date: new Date().toISOString(),
    },
  };
}

/**
 * V10: Process RECORD_PAYMENT intent.
 * Extracts payment fields from the AI interpretation and returns a
 * PaymentFormState for the UI to render.
 */
async function buildPaymentForm(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
  inputType: string,
): Promise<InterpretResult> {
  // Resolve customer name against the user's records
  let resolvedCustomerId: string | null = null;
  if (ai.customerName) {
    const matches = await findCustomerCandidates(userId, ai.customerName);
    if (matches.length === 1) {
      resolvedCustomerId = matches[0]!.id;
    }
  }

  const { customers } = await loadUserCustomersAndProducts(userId);
  const isNewCustomer = !!ai.customerName && !resolvedCustomerId && ai.customerName.length > 0;

  // V12: Fetch the customer's current outstanding balance for display
  let customerBalance: string | null = null;
  if (resolvedCustomerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: resolvedCustomerId, userId, isDeleted: false },
      select: { openingBalance: true },
    });
    if (customer) {
      const [salesAgg, paymentsAgg, adjustmentsAgg] = await Promise.all([
        prisma.sale.aggregate({
          _sum: { totalAmount: true },
          where: { customerId: resolvedCustomerId, userId, voidedAt: null },
        }),
        prisma.payment.aggregate({
          _sum: { amount: true },
          where: { customerId: resolvedCustomerId, userId, voidedAt: null },
        }),
        prisma.customerAdjustment.aggregate({
          _sum: { amount: true },
          where: { customerId: resolvedCustomerId, userId, voidedAt: null },
        }),
      ]);
      const opening = toDecimalOrZero(customer.openingBalance);
      const sales = toDecimalOrZero(salesAgg._sum.totalAmount);
      const payments = toDecimalOrZero(paymentsAgg._sum.amount);
      const adjustments = toDecimalOrZero(adjustmentsAgg._sum.amount);
      const balance = opening.plus(sales).minus(payments).plus(adjustments);
      customerBalance = balance.toString();
    }
  }

  const session = await prisma.smartEntrySession.create({
    data: {
      userId,
      status: "AWAITING_CONFIRMATION",
      inputType: inputType as "text" | "voice",
      transcript,
      rawAiResponse: aiToPrismaJson(ai),
      intent: ai.intent,
      customerNameRaw: ai.customerName,
      resolvedCustomerId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id,
    status: "FORM",
    transcript,
    intent: ai.intent,
    paymentForm: {
      customerNameRaw: ai.customerName,
      resolvedCustomerId,
      amount: ai.explicitPaidAmount ?? null,
      method: "cash",
      notes: null,
      date: new Date().toISOString(),
      isNewCustomer,
      customerCandidates: customers,
      customerBalance,
    },
  };
}

/**
 * Build the supplier-payment confirmation form (money OUT).
 */
async function buildSupplierPaymentForm(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
  inputType: string,
): Promise<InterpretResult> {
  let resolvedSupplierId: string | null = null;
  if (ai.supplierName) {
    const matches = await findSupplierCandidates(userId, ai.supplierName);
    if (matches.length === 1) resolvedSupplierId = matches[0]!.id;
  }

  const suppliers = await listSuppliersWithBalance(userId);
  const supplierCandidates: EntityCandidate[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    phone: s.phone ?? null,
  }));
  const supplierBalance =
    suppliers.find((s) => s.id === resolvedSupplierId)?.balance ?? null;

  const session = await prisma.smartEntrySession.create({
    data: {
      userId,
      status: "AWAITING_CONFIRMATION",
      inputType: inputType as "text" | "voice",
      transcript,
      rawAiResponse: aiToPrismaJson(ai),
      intent: ai.intent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id,
    status: "FORM",
    transcript,
    intent: ai.intent,
    supplierPaymentForm: {
      supplierNameRaw: ai.supplierName ?? null,
      resolvedSupplierId,
      amount: ai.explicitPaidAmount ?? null,
      method: "cash",
      notes: null,
      date: new Date().toISOString(),
      supplierBalance,
      supplierCandidates,
    },
  };
}

/**
 * Build the reminder confirmation form.
 */
async function buildReminderForm(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
  inputType: string,
): Promise<InterpretResult> {
  let resolvedCustomerId: string | null = null;
  if (ai.customerName) {
    const matches = await findCustomerCandidates(userId, ai.customerName);
    if (matches.length === 1) resolvedCustomerId = matches[0]!.id;
  }

  const { customers } = await loadUserCustomersAndProducts(userId);

  const days = Math.max(0, Math.min(3650, ai.reminderInDays ?? 1));
  const due = new Date(Date.now() + days * 86_400_000);
  due.setHours(9, 0, 0, 0);

  const session = await prisma.smartEntrySession.create({
    data: {
      userId,
      status: "AWAITING_CONFIRMATION",
      inputType: inputType as "text" | "voice",
      transcript,
      rawAiResponse: aiToPrismaJson(ai),
      intent: ai.intent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id,
    status: "FORM",
    transcript,
    intent: ai.intent,
    reminderForm: {
      title: (ai.reminderTitle ?? transcript ?? "Reminder").slice(0, 150),
      notes: null,
      type: ai.reminderType ?? "custom",
      priority: ai.reminderPriority ?? "normal",
      dueAt: due.toISOString(),
      customerNameRaw: ai.customerName ?? null,
      resolvedCustomerId,
      customerCandidates: customers,
    },
  };
}

/**
 * Build the purchase confirmation form (stock bought from a named supplier).
 * Creates a payable and adds stock — never an expense.
 */
async function buildPurchaseForm(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
  inputType: string,
): Promise<InterpretResult> {
  let resolvedSupplierId: string | null = null;
  if (ai.supplierName) {
    const matches = await findSupplierCandidates(userId, ai.supplierName);
    if (matches.length === 1) resolvedSupplierId = matches[0]!.id;
  }

  const [suppliers, products] = await Promise.all([
    listSuppliersWithBalance(userId),
    prisma.product.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, unit: true, purchasePrice: true, sellingPrice: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  let resolvedProductId: string | null = null;
  if (ai.productName) {
    const matches = await findProductCandidates(userId, ai.productName);
    if (matches.length === 1) resolvedProductId = matches[0]!.id;
  }

  const product = products.find((p) => p.id === resolvedProductId);
  const unitCost =
    ai.explicitUnitPrice ?? (product ? Number(product.purchasePrice) : null);

  const session = await prisma.smartEntrySession.create({
    data: {
      userId,
      status: "AWAITING_CONFIRMATION",
      inputType: inputType as "text" | "voice",
      transcript,
      rawAiResponse: aiToPrismaJson(ai),
      intent: ai.intent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id,
    status: "FORM",
    transcript,
    intent: ai.intent,
    purchaseForm: {
      supplierNameRaw: ai.supplierName ?? null,
      resolvedSupplierId,
      supplierCandidates: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone ?? null,
      })),
      productNameRaw: ai.productName ?? null,
      resolvedProductId,
      productCandidates: products.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        sellingPrice: p.sellingPrice.toString(),
      })),
      quantity: ai.quantity ?? null,
      unitCost,
      paidAmount: ai.explicitPaidAmount ?? 0,
      notes: null,
      date: new Date().toISOString(),
      supplierBalance:
        suppliers.find((s) => s.id === resolvedSupplierId)?.balance ?? null,
    },
  };
}

/**
 * V10: Process QUERY intent.
 * Executes the query against the user's real data and returns a result.
 *
 * Exported so the verification scripts can exercise every query type against
 * the real database without spending AI quota.
 */
export async function processQuery(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
): Promise<InterpretResult> {
  const queryType = ai.queryType ?? "OTHER";
  const queryEntity = ai.queryEntity ?? null;
  const dateRange = ai.queryDateRange ?? "today";

  let resultText = "";
  let resultData: unknown = null;

  if (queryType === "TODAYS_EXPENSES" || queryType === "EXPENSES_SUMMARY") {
    const filter = dateRange === "today" ? "today" : dateRange === "yesterday" ? "today" : dateRange === "week" ? "week" : dateRange === "month" ? "month" : "all";
    const summary = await getExpensesSummaryForUser(userId, filter);
    resultText = `${dateRange === "today" ? "Today's" : dateRange === "week" ? "This week's" : dateRange === "month" ? "This month's" : "Total"} expenses: Rs. ${Number(summary.total).toLocaleString()} (${summary.count} expenses)`;
    resultData = summary;
  } else if (queryType === "TODAYS_SALES" || queryType === "SALES_SUMMARY") {
    const { startOfTodayInTz, startOfWeekInTz, startOfMonthInTz } = await import("@/lib/utils/date");
    const rangeStart =
      dateRange === "today"
        ? startOfTodayInTz("Asia/Karachi")
        : dateRange === "yesterday"
          ? new Date(startOfTodayInTz("Asia/Karachi").getTime() - 86_400_000)
          : dateRange === "week"
            ? startOfWeekInTz("Asia/Karachi")
            : dateRange === "month"
              ? startOfMonthInTz("Asia/Karachi")
              : undefined;

    // "Today's sales and payments received" means two different numbers:
    // goods sold (revenue) and cash that actually arrived.
    const where = {
      userId,
      voidedAt: null,
      ...(rangeStart ? { date: { gte: rangeStart } } : {}),
    };

    const [sales, paymentsAgg] = await Promise.all([
      prisma.sale.findMany({
        where,
        select: { totalAmount: true, paidAmount: true },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          userId,
          voidedAt: null,
          ...(rangeStart && { date: { gte: rangeStart } }),
        },
      }),
    ]);

    const totalSales = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);
    const paidAtSale = sales.reduce((sum, s) => sum + Number(s.paidAmount), 0);
    const received = paidAtSale + Number(paymentsAgg._sum.amount ?? 0);
    const label =
      dateRange === "today"
        ? "Today"
        : dateRange === "yesterday"
          ? "Yesterday"
          : dateRange === "week"
            ? "This week"
            : dateRange === "month"
              ? "This month"
              : "In total";

    resultText = `${label}: sales of Rs. ${totalSales.toLocaleString()} (${sales.length} sales). Cash received: Rs. ${received.toLocaleString()}.`;
    resultData = {
      totalSales,
      totalReceived: received,
      count: sales.length,
    };
  } else if (queryType === "CUSTOMER_BALANCES") {
    if (queryEntity) {
      const customer = await prisma.customer.findFirst({
        where: { userId, isDeleted: false, name: { contains: queryEntity, mode: "insensitive" } },
        select: { id: true, name: true },
      });

      if (!customer) {
        resultText = `No customer named "${queryEntity}" in your khata.`;
      } else {
        const { balance } = await getCustomerBalance(customer.id);
        const value = Number(balance);
        resultText =
          value > 0
            ? `${customer.name} owes you Rs. ${value.toLocaleString()}.`
            : value < 0
              ? `${customer.name} has an advance of Rs. ${Math.abs(value).toLocaleString()}.`
              : `${customer.name}'s account is settled.`;
        resultData = [
          { name: customer.name, balance: balance.toString(), href: `/khata/${customer.id}` },
        ];
      }
    } else {
      const owing = await listOutstandingCustomers(userId);
      const total = owing.reduce(
        (sum, c) => sum.plus(toDecimalOrZero(c.balance)),
        new Decimal(0),
      );
      resultText =
        owing.length > 0
          ? `${owing.length} customers owe you a total of Rs. ${Number(total).toLocaleString()}.`
          : "No customers owe you money.";
      resultData = owing.slice(0, 20).map((c) => ({
        name: c.name,
        balance: c.balance,
        href: `/khata/${c.id}`,
      }));
    }
  } else if (queryType === "LOW_STOCK") {
    const insights = await getBusinessInsights(userId);

    if (insights.lowStock.length === 0) {
      resultText = "Nothing is below its low-stock level.";
      resultData = [];
    } else {
      resultText = `${insights.lowStock.length} products are at or below their low-stock level.`;
      resultData = insights.lowStock.map((p) => ({
        name: p.name,
        stock: Number(p.currentStock),
        href: `/more/products/${p.id}`,
      }));
    }
  } else if (queryType === "INACTIVE_CUSTOMERS") {
    const insights = await getBusinessInsights(userId);
    const inactive = insights.inactiveCustomers;

    if (inactive.length === 0) {
      resultText = "Every customer has bought something recently.";
      resultData = [];
    } else {
      resultText =
        inactive.length === 1
          ? "1 customer used to buy from you but has gone quiet."
          : `${inactive.length} customers used to buy from you but have gone quiet.`;
      resultData = inactive.slice(0, 20).map((c) => ({
        name: c.name,
        balance: c.balance,
        href: `/khata/${c.id}`,
      }));
    }
  } else if (queryType === "REORDER_CANDIDATES") {
    const candidates = await getFollowUpCandidates(userId);

    if (candidates.length === 0) {
      resultText = "No customer is past their usual buying interval right now.";
      resultData = [];
    } else {
      resultText =
        candidates.length === 1
          ? "1 customer is past their usual buying interval — worth a call."
          : `${candidates.length} customers are past their usual buying interval — worth a call.`;
      resultData = candidates.slice(0, 10).map((c) => ({
        name: c.productName ? `${c.customerName} — ${c.productName}` : c.customerName,
        days: c.daysSinceLastPurchase,
        href: "/more/follow-ups",
      }));
    }
  } else if (queryType === "SUPPLIER_PURCHASES") {
    const supplier = queryEntity
      ? await prisma.supplier.findFirst({
          where: {
            userId,
            isDeleted: false,
            name: { contains: queryEntity, mode: "insensitive" },
          },
          select: { id: true, name: true },
        })
      : null;

    if (queryEntity && !supplier) {
      resultText = `No supplier named "${queryEntity}" in your records.`;
      resultData = [];
    } else {
      const purchases = await prisma.purchase.findMany({
        where: {
          userId,
          voidedAt: null,
          ...(supplier ? { supplierId: supplier.id } : {}),
        },
        select: {
          id: true,
          totalAmount: true,
          outstanding: true,
          date: true,
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
        take: 10,
      });

      const total = purchases.reduce((sum, p) => sum + Number(p.totalAmount), 0);
      const unpaid = purchases.reduce((sum, p) => sum + Number(p.outstanding), 0);

      if (purchases.length === 0) {
        resultText = supplier
          ? `No purchases recorded from ${supplier.name} yet.`
          : "No purchases recorded yet.";
        resultData = [];
      } else {
        const who = supplier ? ` from ${supplier.name}` : "";
        resultText =
          `Last ${purchases.length} purchases${who} total Rs. ${total.toLocaleString()}` +
          (unpaid > 0 ? `, of which Rs. ${unpaid.toLocaleString()} is still unpaid.` : ".");
        resultData = purchases.map((p) => ({
          name: `${p.supplier.name} — ${p.date.toISOString().slice(0, 10)}`,
          amount: p.totalAmount.toString(),
          href: `/more/suppliers/${p.supplier.id}`,
        }));
      }
    }
  } else if (queryType === "STOCK_LEVEL" && queryEntity) {
    const product = await prisma.product.findFirst({
      where: { userId, isDeleted: false, name: { contains: queryEntity, mode: "insensitive" } },
      select: { id: true, name: true, openingStock: true },
    });
    if (product) {
      const movesAgg = await prisma.stockMove.aggregate({
        _sum: { quantity: true },
        where: { productId: product.id, userId, voidedAt: null },
      });
      const soldAgg = await prisma.saleItem.aggregate({
        _sum: { quantity: true },
        where: { productId: product.id, sale: { userId, voidedAt: null } },
      });
      const stock = Number(product.openingStock) + Number(movesAgg._sum.quantity ?? 0) - Number(soldAgg._sum.quantity ?? 0);
      resultText = `Current stock of ${product.name}: ${stock} units.`;
      resultData = { product: product.name, stock };
    } else {
      resultText = `Product "${queryEntity}" not found in your inventory.`;
    }
  } else if (queryType === "SUPPLIER_PAYABLES") {
    const suppliers = await listSuppliersWithBalance(userId);
    const owing = suppliers.filter((s) => toDecimalOrZero(s.balance).greaterThan(0));

    if (queryEntity) {
      const needle = queryEntity.toLowerCase();
      const matches = owing.filter((s) => s.name.toLowerCase().includes(needle));
      if (matches.length === 0) {
        resultText = `You do not owe "${queryEntity}" anything.`;
        resultData = [];
      } else {
        const total = matches.reduce(
          (sum, s) => sum.plus(toDecimalOrZero(s.balance)),
          new Decimal(0),
        );
        resultText = `You owe ${matches.map((m) => m.name).join(", ")} Rs. ${Number(total).toLocaleString()}.`;
        resultData = matches.map((m) => ({
          name: m.name,
          balance: m.balance,
          href: `/more/suppliers/${m.id}`,
        }));
      }
    } else {
      const total = owing.reduce(
        (sum, s) => sum.plus(toDecimalOrZero(s.balance)),
        new Decimal(0),
      );
      resultText = owing.length > 0
        ? `You owe ${owing.length} suppliers a total of Rs. ${Number(total).toLocaleString()}.`
        : "You do not owe any supplier money.";
      resultData = {
        total: total.toString(),
        count: owing.length,
        suppliers: owing.slice(0, 20).map((s) => ({
          name: s.name,
          balance: s.balance,
          href: `/more/suppliers/${s.id}`,
        })),
      };
    }
  } else if (queryType === "TODAYS_REMINDERS") {
    const [counts, todayItems, overdueItems] = await Promise.all([
      getReminderCounts(userId),
      listReminders("today", userId),
      listReminders("overdue", userId),
    ]);

    if (counts.overdue + counts.today === 0) {
      resultText = "You have no reminders due today.";
    } else {
      const parts: string[] = [];
      if (counts.overdue > 0) parts.push(`${counts.overdue} overdue`);
      if (counts.today > 0) parts.push(`${counts.today} due today`);
      resultText = `You have ${parts.join(" and ")}.`;
      if (overdueItems.length > 0) {
        resultText += ` Overdue: ${overdueItems.slice(0, 3).map((r) => r.title).join("; ")}.`;
      }
      if (todayItems.length > 0) {
        resultText += ` Today: ${todayItems.slice(0, 3).map((r) => r.title).join("; ")}.`;
      }
    }
    resultData = { counts, today: todayItems, overdue: overdueItems };
  } else {
    resultText = "I can check expenses, sales, customer balances, stock levels, low stock, supplier payables and purchases, reminders, customers who stopped buying, and customers ready to reorder. What would you like to know?";
  }

  const session = await prisma.smartEntrySession.create({
    data: {
      userId,
      status: "AWAITING_CONFIRMATION",
      inputType: "text",
      transcript,
      rawAiResponse: aiToPrismaJson(ai),
      intent: ai.intent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id,
    status: "FORM",
    transcript,
    intent: ai.intent,
    queryResult: {
      queryType,
      queryEntity,
      queryDateRange: dateRange,
      result: resultText,
      data: resultData,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// V11: Process STOCK_INTAKE intent
// ────────────────────────────────────────────────────────────────────────────

async function buildStockIntakeForm(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
  inputType: string,
): Promise<InterpretResult> {
  // Resolve product name against the user's records
  let resolvedProductId: string | null = null;
  if (ai.productName) {
    const matches = await findProductCandidates(userId, ai.productName);
    if (matches.length === 1) {
      resolvedProductId = matches[0]!.id;
    }
  }

  const { products } = await loadUserCustomersAndProducts(userId);
  const isNewProduct = !!ai.productName && !resolvedProductId && ai.productName.length > 0;

  const session = await prisma.smartEntrySession.create({
    data: {
      userId,
      status: "AWAITING_CONFIRMATION",
      inputType: inputType as "text" | "voice",
      transcript,
      rawAiResponse: aiToPrismaJson(ai),
      intent: ai.intent,
      productNameRaw: ai.productName,
      resolvedProductId,
      quantityRaw: ai.quantity ?? null,
      unitRaw: ai.unit ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id,
    status: "FORM",
    transcript,
    intent: ai.intent,
    stockIntakeForm: {
      productNameRaw: ai.productName,
      resolvedProductId,
      quantity: ai.quantity ?? null,
      unit: ai.unit ?? null,
      unitCost: ai.explicitUnitPrice ?? null,
      batchName: ai.batchName ?? null,
      date: new Date().toISOString(),
      isNewProduct,
      productCandidates: products,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// V13: CREATE_PRODUCT — dedicated product creation form (NOT the sale form)
// ────────────────────────────────────────────────────────────────────────────
async function buildProductCreationForm(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
  inputType: string,
): Promise<InterpretResult> {
  const mentionedStock = ai.quantity != null && ai.quantity > 0;
  const aiPrice = ai.explicitUnitPrice ?? null;
  const session = await prisma.smartEntrySession.create({
    data: {
      userId, status: "AWAITING_CONFIRMATION", inputType: inputType as "text" | "voice",
      transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent,
      productNameRaw: ai.productName, quantityRaw: ai.quantity ?? null, unitRaw: ai.unit ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
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

// ────────────────────────────────────────────────────────────────────────────
// V13: CREATE_CUSTOMER — dedicated customer creation form (NOT the sale form)
// ────────────────────────────────────────────────────────────────────────────
async function buildCustomerCreationForm(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
  inputType: string,
): Promise<InterpretResult> {
  const openingBalance = ai.explicitTotal ?? ai.explicitPaidAmount ?? null;
  const session = await prisma.smartEntrySession.create({
    data: {
      userId, status: "AWAITING_CONFIRMATION", inputType: inputType as "text" | "voice",
      transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent,
      customerNameRaw: ai.customerName, expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return {
    sessionId: session.id, status: "FORM", transcript, intent: ai.intent,
    customerCreationForm: {
      name: ai.customerName ?? null, phone: null, address: null, notes: null,
      openingBalance, hint: null,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// V13: UNKNOWN — clarification question (NOT the sale form)
// ────────────────────────────────────────────────────────────────────────────
async function buildClarificationForm(
  userId: string,
  ai: AiInterpretation,
  transcript: string | null,
  inputType: string,
): Promise<InterpretResult> {
  const question = ai.clarificationQuestion?.trim() || "I didn't understand. Try: \"Ahmad bought 25 kg rice\" or \"Add a product called sugar\".";
  const session = await prisma.smartEntrySession.create({
    data: {
      userId, status: "AWAITING_CONFIRMATION", inputType: inputType as "text" | "voice",
      transcript, rawAiResponse: aiToPrismaJson(ai), intent: ai.intent,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return {
    sessionId: session.id, status: "FORM", transcript, intent: ai.intent,
    clarification: {
      question, suggestions: ["Ahmad bought 25 kg rice", "Add a product called sugar", "Ahmad paid me 5000", "I spent 200 on tea"],
    },
  };
}

// Helper: get expenses summary for a user (used by QUERY intent)
async function getExpensesSummaryForUser(userId: string, filter: string) {
  const { startOfTodayInTz, startOfWeekInTz, startOfMonthInTz } = await import("@/lib/utils/date");
  let startDate: Date | undefined;
  switch (filter) {
    case "today": startDate = startOfTodayInTz("Asia/Karachi"); break;
    case "week": startDate = startOfWeekInTz("Asia/Karachi"); break;
    case "month": startDate = startOfMonthInTz("Asia/Karachi"); break;
    default: startDate = undefined;
  }
  const agg = await prisma.expense.aggregate({
    _sum: { amount: true },
    _count: { _all: true },
    where: { userId, voidedAt: null, ...(startDate && { date: { gte: startDate } }) },
  });
  return {
    total: agg._sum.amount?.toString() ?? "0",
    count: agg._count._all,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. EXECUTE — user confirmed; create the actual Sale
// ────────────────────────────────────────────────────────────────────────────

/**
 * V3: The client sends the FINAL form values including unitPrice.
 *
 * PRICING PRIORITY (server-side re-validation):
 *   - If unitPrice is provided by the client → use it (user explicitly set it)
 *   - If unitPrice is NOT provided → use product.sellingPrice (default)
 *   - amount = quantity × unitPrice (ALWAYS computed server-side, NEVER from client)
 *
 * The backend NEVER trusts the client's amount. It always recomputes:
 *   amount = quantity × unitPrice
 *
 * Security:
 *   1. sessionId belongs to this user
 *   2. session is in AWAITING_CONFIRMATION state, not expired
 *   3. customerId belongs to this user, not deleted
 *   4. productId belongs to this user, not deleted
 *   5. quantity is positive
 *   6. unitPrice: if provided, must be positive. If not provided, uses product.sellingPrice
 *   7. amount = quantity × unitPrice (computed SERVER-SIDE)
 *   8. Atomic EXECUTING transition (prevents double-execution)
 *   9. Call existing SaleService.createSale()
 */
export async function executeSession(
  userId: string,
  input: {
    sessionId: string;
    customerId: string;
    productId: string;
    quantity: number;
    unitPrice?: number;
    paidAmount?: number;
    batchId?: string;
  },
): Promise<ExecuteResult> {
  const { sessionId, customerId, productId, quantity } = input;
  const clientUnitPrice = input.unitPrice;
  const clientPaidAmount = input.paidAmount ?? 0;
  const clientBatchId = input.batchId;

  // 1. Load + verify session belongs to this user
  const session = await loadAndVerifySession(userId, sessionId);

  // 2. Handle already-terminal states (idempotent re-execute)
  if (session.status === "COMPLETED" && session.createdSaleId) {
    const existingSale = await prisma.sale.findFirst({
      where: { id: session.createdSaleId, userId },
      select: { id: true, totalAmount: true, outstanding: true },
    });
    if (existingSale) {
      return {
        saleId: existingSale.id,
        totalAmount: existingSale.totalAmount.toString(),
        outstanding: existingSale.outstanding.toString(),
        resultType: "sale" as const,
        message: tServer(
          "api.smartEntry.alreadyAdded",
          { amount: Number(existingSale.totalAmount).toLocaleString() },
          "en",
        ),
      };
    }
    throw new BadRequestError("api.smartEntry.processedButSaleGone");
  }

  // 3. Atomic claim — prevents double-execution from concurrent requests
  const claimed = await prisma.smartEntrySession.updateMany({
    where: {
      id: sessionId,
      userId,
      status: "AWAITING_CONFIRMATION",
    },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });

  if (claimed.count === 0) {
    const current = await prisma.smartEntrySession.findFirst({
      where: { id: sessionId, userId },
      select: { status: true },
    });
    const currentState = current?.status ?? "UNKNOWN";
    if (currentState === "EXECUTING") {
      throw new BadRequestError("api.smartEntry.alreadyProcessing");
    }
    throw new BadRequestError(
      "api.smartEntry.wrongState",
      undefined,
      { state: currentState },
    );
  }

  // From here, we OWN this session. If anything fails, mark FAILED.
  try {
    // 4. Verify not expired
    if (isExpired(session)) {
      await prisma.smartEntrySession.update({
        where: { id: sessionId },
        data: { status: "EXPIRED", completedAt: new Date() },
      });
      throw new BadRequestError("api.smartEntry.expired");
    }

    // 5. Re-validate customer — MUST belong to this user
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId, isDeleted: false },
    });
    if (!customer) {
      throw new NotFoundError("api.resource.customer");
    }

    // 6. Re-validate product — MUST belong to this user
    const product = await prisma.product.findFirst({
      where: { id: productId, userId, isDeleted: false },
    });
    if (!product) {
      throw new NotFoundError("api.resource.product");
    }

    // 7. Validate quantity (positive number)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestError("api.smartEntry.invalidQuantity");
    }

    // V5: Validate batch selection
    const quantityDec = new Decimal(quantity);

    // 1. Fetch eligible batches for this product+user
    const eligibleBatches = await prisma.stockMove.findMany({
      where: {
        productId: product.id,
        userId,
        voidedAt: null,
        type: { in: ["purchase", "return"] },
        remainingQuantity: { gt: 0 },
      },
      orderBy: { date: "desc" },
      select: { id: true, reason: true, remainingQuantity: true, unitCost: true },
    });

    // 2. If multiple eligible batches exist, batchId is REQUIRED
    if (eligibleBatches.length > 1 && !clientBatchId) {
      throw new BadRequestError("api.smartEntry.batchRequired");
    }

    // 3. If batchId is provided, validate it
    let validatedBatchId: string | null = null;
    if (clientBatchId) {
      const batch = eligibleBatches.find((b) => b.id === clientBatchId);
      if (!batch) {
        throw new BadRequestError("api.smartEntry.batchUnavailable");
      }
      // Check sufficient stock
      const remaining = toDecimalOrZero(batch.remainingQuantity);
      if (remaining.lt(quantityDec)) {
        throw new BadRequestError(
          "api.smartEntry.batchInsufficient",
          undefined,
          { remaining: remaining.toString(), demanded: quantityDec.toString() },
        );
      }
      validatedBatchId = batch.id;
    } else if (eligibleBatches.length === 1) {
      // Auto-select the single eligible batch
      validatedBatchId = eligibleBatches[0]!.id;
    }

    // V3: Determine final unit price (priority: client-provided > product default)
    // If the client provided a unitPrice (user explicitly set it in the form),
    // use it. Otherwise, fall back to the product's default sellingPrice.
    // The amount is ALWAYS computed server-side: amount = quantity × unitPrice
    const finalUnitPrice = clientUnitPrice != null && clientUnitPrice > 0
      ? toDecimal(clientUnitPrice)
      : toDecimal(product.sellingPrice);
    const amount = quantityDec.times(finalUnitPrice);

    // 9. Call existing SaleService.createSale() — the trusted path.
    //    V4: paidAmount can be > 0 (partial payment) or 0 (full credit sale).
    //    Backend validates paidAmount <= totalAmount.
    const paidAmountDec = new Decimal(clientPaidAmount);
    if (paidAmountDec.gt(amount)) {
      throw new BadRequestError(
        "api.sale.paidExceedsTotal",
        undefined,
        { paid: paidAmountDec.toString(), total: amount.toString() },
      );
    }

    const sale = await createSale(
      {
        customerId: customer.id,
        items: [
          {
            productId: product.id,
            quantity: quantityDec.toNumber(),
            unitPrice: finalUnitPrice.toNumber(),
            // V5: pass the validated batch ID so stock is deducted from the correct batch
            batchId: validatedBatchId ?? undefined,
          },
        ],
        paidAmount: paidAmountDec.toNumber(),
        paymentMethod: "cash",
      },
      userId,
    );

    // 10. Mark session COMPLETED + link to created sale
    await prisma.smartEntrySession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        createdSaleId: sale.id,
        resolvedCustomerId: customer.id,
        resolvedProductId: product.id,
        resolvedUnit: product.unit,
        resolvedQuantity: quantityDec,
        resolvedUnitPrice: finalUnitPrice,
        resolvedAmount: amount,
      },
    });

    invalidateCache("dashboard");
    invalidateCache("customers");
    invalidateCache("products");
    invalidateCache("sales");

    return {
      saleId: sale.id,
      totalAmount: sale.totalAmount,
      outstanding: sale.outstanding,
      resultType: "sale" as const,
      message: `Added to Khata — Rs. ${Number(sale.totalAmount).toLocaleString()}`,
    };
  } catch (error) {
    if (error instanceof BadRequestError && error.message.includes("expired")) {
      throw error;
    }
    await prisma.smartEntrySession.update({
      where: { id: sessionId },
      data: { status: "FAILED", completedAt: new Date() },
    }).catch(() => {});
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// V10: Execute EXPENSE — user confirmed; create the expense
// ────────────────────────────────────────────────────────────────────────────

export async function executeExpenseSession(
  userId: string,
  input: {
    sessionId: string;
    expenseName: string;
    amount: number;
    category: string;
    notes?: string | null;
    date?: string;
  },
): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);

  if (session.status === "COMPLETED") {
    throw new BadRequestError("api.smartEntry.alreadyProcessed");
  }

  // Atomic claim
  const claimed = await prisma.smartEntrySession.updateMany({
    where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new BadRequestError("api.smartExecute.wrongState");
  }

  try {
    // Re-use the existing expense service
    const expense = await recordExpense({
      name: input.expenseName,
      amount: input.amount,
      category: input.category,
      notes: input.notes ?? null,
      date: input.date,
    }, userId);

    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    invalidateCache("dashboard");
    invalidateCache("expenses");

    return {
      expenseId: expense.id,
      resultType: "expense",
      message: tServer(
        "api.smartExecute.expenseRecorded",
        { name: expense.name, amount: Number(expense.amount).toLocaleString() },
        "en",
      ),
    };
  } catch (error) {
    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "FAILED", completedAt: new Date() },
    }).catch(() => {});
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// V10: Execute PAYMENT — user confirmed; record the payment
// ────────────────────────────────────────────────────────────────────────────

export async function executePaymentSession(
  userId: string,
  input: {
    sessionId: string;
    customerId: string;
    amount: number;
    method?: string;
    notes?: string | null;
    date?: string;
  },
): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);

  if (session.status === "COMPLETED") {
    throw new BadRequestError("api.smartEntry.alreadyProcessed");
  }

  // Atomic claim
  const claimed = await prisma.smartEntrySession.updateMany({
    where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new BadRequestError("api.smartExecute.wrongState");
  }

  try {
    // Re-use the existing payment service
    const payment = await recordPayment({
      customerId: input.customerId,
      amount: input.amount,
      method: (input.method ?? "cash") as "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other",
      notes: input.notes ?? null,
      date: input.date,
    }, userId);

    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        resolvedCustomerId: input.customerId,
      },
    });

    invalidateCache("dashboard");
    invalidateCache("customers");
    invalidateCache("payments");

    return {
      paymentId: payment.id,
      resultType: "payment",
      message: tServer(
        "api.smartExecute.paymentRecorded",
        { amount: Number(payment.amount).toLocaleString(), customer: payment.customerName },
        "en",
      ),
    };
  } catch (error) {
    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "FAILED", completedAt: new Date() },
    }).catch(() => {});
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Execute a confirmed CREATE_PURCHASE (stock in + payable)
// ────────────────────────────────────────────────────────────────────────────

export async function executePurchaseSession(
  userId: string,
  input: {
    sessionId: string;
    supplierId: string;
    productId: string;
    quantity: number;
    unitCost: number;
    paidAmount?: number;
    notes?: string | null;
    date?: string;
  },
): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") {
    throw new BadRequestError("api.smartEntry.alreadyProcessed");
  }

  const claimed = await prisma.smartEntrySession.updateMany({
    where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new BadRequestError("api.smartExecute.wrongState");
  }

  try {
    const purchase = await createPurchase(
      {
        supplierId: input.supplierId,
        items: [
          {
            productId: input.productId,
            quantity: input.quantity,
            unitCost: input.unitCost,
          },
        ],
        paidAmount: input.paidAmount ?? 0,
        notes: input.notes ?? null,
        date: input.date,
      },
      userId,
    );

    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    invalidateCache("dashboard");
    invalidateCache("suppliers");
    invalidateCache("transactions");
    invalidateCache("stock");
    invalidateCache("products");

    return {
      resultType: "purchase",
      message: tServer(
        "api.smartExecute.purchaseRecorded",
        {
          total: Number(purchase.totalAmount).toLocaleString(),
          supplier: purchase.supplierName ?? "",
        },
        "en",
      ),
    };
  } catch (error) {
    await prisma.smartEntrySession
      .update({
        where: { id: input.sessionId },
        data: { status: "FAILED", completedAt: new Date() },
      })
      .catch(() => {});
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Execute a confirmed SUPPLIER_PAYMENT (money OUT)
// ────────────────────────────────────────────────────────────────────────────

export async function executeSupplierPaymentSession(
  userId: string,
  input: {
    sessionId: string;
    supplierId: string;
    amount: number;
    method?: string;
    notes?: string | null;
    date?: string;
  },
): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") {
    throw new BadRequestError("api.smartEntry.alreadyProcessed");
  }

  const claimed = await prisma.smartEntrySession.updateMany({
    where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new BadRequestError("api.smartExecute.wrongState");
  }

  try {
    const payment = await createSupplierPayment(
      {
        supplierId: input.supplierId,
        amount: input.amount,
        method: (input.method ?? "cash") as
          | "cash" | "bank" | "cheque" | "jazzcash" | "easypaisa" | "other",
        notes: input.notes ?? null,
        date: input.date,
      },
      userId,
    );

    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    invalidateCache("dashboard");
    invalidateCache("suppliers");
    invalidateCache("transactions");

    return {
      resultType: "supplier_payment",
      message: tServer(
        "api.smartExecute.supplierPaymentRecorded",
        {
          amount: Number(payment.amount).toLocaleString(),
          supplier: payment.supplierName ?? "",
        },
        "en",
      ),
    };
  } catch (error) {
    await prisma.smartEntrySession
      .update({
        where: { id: input.sessionId },
        data: { status: "FAILED", completedAt: new Date() },
      })
      .catch(() => {});
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Execute a confirmed CREATE_REMINDER
// ────────────────────────────────────────────────────────────────────────────

export async function executeReminderSession(
  userId: string,
  input: {
    sessionId: string;
    title: string;
    dueAt: string;
    type?: string;
    priority?: string;
    notes?: string | null;
    customerId?: string | null;
  },
): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") {
    throw new BadRequestError("api.smartEntry.alreadyProcessed");
  }

  const claimed = await prisma.smartEntrySession.updateMany({
    where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new BadRequestError("api.smartExecute.wrongState");
  }

  try {
    const reminder = await createReminder(
      {
        title: input.title,
        notes: input.notes ?? null,
        type: input.type ?? "custom",
        dueAt: input.dueAt,
        priority: input.priority ?? "normal",
        customerId: input.customerId ?? null,
      },
      userId,
    );

    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    invalidateCache("dashboard");
    invalidateCache("reminders");

    return {
      resultType: "reminder",
      message: tServer(
        "api.smartExecute.reminderCreated",
        { title: reminder.title },
        "en",
      ),
    };
  } catch (error) {
    await prisma.smartEntrySession
      .update({
        where: { id: input.sessionId },
        data: { status: "FAILED", completedAt: new Date() },
      })
      .catch(() => {});
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// V11: Execute STOCK_INTAKE — user confirmed; record the stock movement
// ────────────────────────────────────────────────────────────────────────────

export async function executeStockIntakeSession(
  userId: string,
  input: {
    sessionId: string;
    productId: string;
    quantity: number;
    unitCost?: number;
    batchName?: string | null;
    date?: string;
  },
): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);

  if (session.status === "COMPLETED") {
    throw new BadRequestError("api.smartEntry.alreadyProcessed");
  }

  // Atomic claim
  const claimed = await prisma.smartEntrySession.updateMany({
    where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new BadRequestError("api.smartExecute.wrongState");
  }

  try {
    // Re-use the existing stock service — same validation + Transaction ledger
    const move = await addStockMove({
      productId: input.productId,
      type: "purchase",
      quantity: input.quantity,
      unitCost: input.unitCost ?? null,
      batchName: input.batchName ?? null,
      date: input.date,
    }, userId);

    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        resolvedProductId: input.productId,
      },
    });

    invalidateCache("dashboard");
    invalidateCache("products");
    invalidateCache("stock");

    return {
      resultType: "stock_intake",
      message: tServer(
        "api.smartExecute.stockAdded",
        { qty: input.quantity, batch: move.reason ? ` (batch: ${move.reason})` : "" },
        "en",
      ),
    };
  } catch (error) {
    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "FAILED", completedAt: new Date() },
    }).catch(() => {});
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// V13: Execute CREATE_PRODUCT — reuses createProductWithOpeningStock
// ────────────────────────────────────────────────────────────────────────────
export async function executeProductCreationSession(
  userId: string,
  input: {
    sessionId: string;
    name: string;
    unit: string;
    purchasePrice: number;
    sellingPrice: number;
    openingStock?: number;
    lowStockThreshold?: number;
    category?: string | null;
    sku?: string | null;
  },
): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") {
    throw new BadRequestError("api.smartEntry.alreadyProcessed");
  }
  const claimed = await prisma.smartEntrySession.updateMany({
    where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new BadRequestError("api.smartExecute.wrongState");
  }
  try {
    const result = await createProductWithOpeningStock({
      name: input.name, unit: input.unit,
      purchasePrice: input.purchasePrice, sellingPrice: input.sellingPrice,
      openingStock: input.openingStock ?? 0,
      lowStockThreshold: input.lowStockThreshold ?? 5,
      category: input.category ?? null, sku: input.sku ?? null,
    }, userId);

    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "COMPLETED", completedAt: new Date(), resolvedProductId: result.product.id },
    });

    invalidateCache("dashboard");
    invalidateCache("products");
    invalidateCache("stock");

    return {
      productId: result.product.id,
      resultType: "product",
      message: `Product created: ${result.product.name}`,
    };
  } catch (error) {
    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "FAILED", completedAt: new Date() },
    }).catch(() => {});
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// V13: Execute CREATE_CUSTOMER — reuses createCustomer
// ────────────────────────────────────────────────────────────────────────────
export async function executeCustomerCreationSession(
  userId: string,
  input: {
    sessionId: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    notes?: string | null;
    openingBalance?: number;
  },
): Promise<ExecuteResult> {
  const session = await loadAndVerifySession(userId, input.sessionId);
  if (session.status === "COMPLETED") {
    throw new BadRequestError("api.smartEntry.alreadyProcessed");
  }
  const claimed = await prisma.smartEntrySession.updateMany({
    where: { id: input.sessionId, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new BadRequestError("api.smartExecute.wrongState");
  }
  try {
    const customer = await createCustomer({
      name: input.name, phone: input.phone ?? null,
      address: input.address ?? null, notes: input.notes ?? null,
      openingBalance: input.openingBalance ?? 0,
    }, userId);

    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "COMPLETED", completedAt: new Date(), resolvedCustomerId: customer.id },
    });

    invalidateCache("dashboard");
    invalidateCache("customers");

    return {
      customerId: customer.id,
      resultType: "customer",
      message: `Customer added: ${customer.name}`,
    };
  } catch (error) {
    await prisma.smartEntrySession.update({
      where: { id: input.sessionId },
      data: { status: "FAILED", completedAt: new Date() },
    }).catch(() => {});
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. CANCEL — user cancelled; mark the session CANCELLED
// ────────────────────────────────────────────────────────────────────────────

export async function cancelSession(
  userId: string,
  sessionId: string,
): Promise<{ id: string; cancelled: true }> {
  const session = await loadAndVerifySession(userId, sessionId);
  if (session.status === "COMPLETED") {
    throw new BadRequestError("api.smartEntry.cannotCancelCompleted");
  }
  await prisma.smartEntrySession.update({
    where: { id: sessionId },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  return { id: sessionId, cancelled: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

async function loadAndVerifySession(userId: string, sessionId: string) {
  const session = await prisma.smartEntrySession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) {
    throw new NotFoundError("api.resource.smartEntrySession", sessionId);
  }
  return session;
}

function isExpired(session: { expiresAt: Date }): boolean {
  return session.expiresAt.getTime() < Date.now();
}

async function buildAIContext(userId: string): Promise<AIContext> {
  const [customers, products, settings] = await Promise.all([
    prisma.customer.findMany({
      where: { userId, isDeleted: false },
      select: { name: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.product.findMany({
      where: { userId, isDeleted: false },
      select: { name: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.setting.findUnique({
      where: { id: "singleton" },
      select: { customUnits: true },
    }),
  ]);

  const defaultUnits = ["kg", "piece", "box", "bag", "dozen", "litre", "metre"];
  const customUnits = settings?.customUnits ?? [];
  const allUnits = Array.from(new Set([...defaultUnits, ...customUnits]));

  return {
    customerNames: customers.map((c) => c.name),
    productNames: products.map((p) => p.name),
    units: allUnits,
  };
}

/** Load ALL the user's customers + products (for the searchable pickers in the form). */
async function loadUserCustomersAndProducts(userId: string): Promise<{
  customers: EntityCandidate[];
  products: EntityCandidate[];
}> {
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.product.findMany({
      where: { userId, isDeleted: false },
      select: { id: true, name: true, unit: true, sellingPrice: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return {
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      sellingPrice: p.sellingPrice.toString(),
    })),
  };
}

async function findCustomerCandidates(
  userId: string,
  name: string,
): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  const cleanName = name.trim();
  if (!cleanName) return [];

  const exact = await prisma.customer.findMany({
    where: { userId, isDeleted: false, name: { equals: cleanName, mode: "insensitive" } },
    select: { id: true, name: true, phone: true },
    take: 6,
  });
  if (exact.length > 0) return exact;

  const startsWith = await prisma.customer.findMany({
    where: { userId, isDeleted: false, name: { startsWith: cleanName, mode: "insensitive" } },
    select: { id: true, name: true, phone: true },
    take: 6,
  });
  if (startsWith.length > 0) return startsWith;

  const contains = await prisma.customer.findMany({
    where: { userId, isDeleted: false, name: { contains: cleanName, mode: "insensitive" } },
    select: { id: true, name: true, phone: true },
    take: 6,
  });
  return contains;
}

async function findSupplierCandidates(
  userId: string,
  name: string,
): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  const cleanName = name.trim();
  if (!cleanName) return [];

  const exact = await prisma.supplier.findMany({
    where: { userId, isDeleted: false, name: { equals: cleanName, mode: "insensitive" } },
    select: { id: true, name: true, phone: true },
    take: 6,
  });
  if (exact.length > 0) return exact;

  const startsWith = await prisma.supplier.findMany({
    where: { userId, isDeleted: false, name: { startsWith: cleanName, mode: "insensitive" } },
    select: { id: true, name: true, phone: true },
    take: 6,
  });
  if (startsWith.length > 0) return startsWith;

  return prisma.supplier.findMany({
    where: { userId, isDeleted: false, name: { contains: cleanName, mode: "insensitive" } },
    select: { id: true, name: true, phone: true },
    take: 6,
  });
}

async function findProductCandidates(
  userId: string,
  name: string,
): Promise<Array<{ id: string; name: string; unit: string; sellingPrice: Decimal }>> {  const cleanName = name.trim();
  if (!cleanName) return [];

  const exact = await prisma.product.findMany({
    where: { userId, isDeleted: false, name: { equals: cleanName, mode: "insensitive" } },
    select: { id: true, name: true, unit: true, sellingPrice: true },
    take: 6,
  });
  if (exact.length > 0) return exact;

  const startsWith = await prisma.product.findMany({
    where: { userId, isDeleted: false, name: { startsWith: cleanName, mode: "insensitive" } },
    select: { id: true, name: true, unit: true, sellingPrice: true },
    take: 6,
  });
  if (startsWith.length > 0) return startsWith;

  const contains = await prisma.product.findMany({
    where: { userId, isDeleted: false, name: { contains: cleanName, mode: "insensitive" } },
    select: { id: true, name: true, unit: true, sellingPrice: true },
    take: 6,
  });
  return contains;
}

/**
 * Build a helpful hint for the user based on what's missing.
 * Examples:
 *   - Customer + product understood, quantity missing → "How much rice?"
 *   - Customer understood, product missing → "What product did you sell?"
 *   - Nothing understood → null (form is just empty, no hint needed)
 */
function buildHint(
  ai: AiInterpretation,
  priceSource: FormFieldState["priceSource"],
  defaultUnitPrice: number | null,
): string | null {
  // If everything is filled AND we have a price, no hint needed
  if (
    ai.customerName &&
    ai.productName &&
    ai.quantity &&
    ai.quantity > 0 &&
    ai.unit &&
    priceSource !== "NONE"
  ) {
    return null;
  }

  // Build a hint for the most important missing piece
  if (ai.customerName && ai.productName && (!ai.quantity || ai.quantity <= 0)) {
    return `How much ${ai.productName} did you give ${ai.customerName}?`;
  }
  if (ai.customerName && !ai.productName) {
    return `What product did you sell to ${ai.customerName}?`;
  }
  if (!ai.customerName && ai.productName) {
    return `Who bought the ${ai.productName}?`;
  }
  if (ai.customerName && ai.productName && ai.quantity && !ai.unit) {
    return `What unit? (kg, piece, box, etc.)`;
  }
  // V3: Price hint — if everything else is filled but no price
  if (
    ai.customerName &&
    ai.productName &&
    ai.quantity &&
    ai.quantity > 0 &&
    priceSource === "NONE" &&
    defaultUnitPrice == null
  ) {
    return `What's the price per ${ai.unit ?? "unit"} for ${ai.productName}?`;
  }
  return null;
}
