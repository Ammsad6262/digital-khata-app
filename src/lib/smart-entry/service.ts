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
import { invalidateCache } from "@/lib/utils/cache";
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

  // All of the user's customers + products (for the searchable pickers)
  customerCandidates: EntityCandidate[];
  productCandidates: EntityCandidate[];

  // Helpful hint for the user
  hint: string | null;
};

export type InterpretResult = {
  sessionId: string;
  status: InterpretStatus;
  transcript: string | null;
  // For FORM status — the editable form data:
  form?: FormFieldState;
  // For FAILED status — user-friendly message:
  message?: string;
};

export type ExecuteResult = {
  saleId: string;
  totalAmount: string;
  outstanding: string;
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
          `Audio too large (max ${MAX_AUDIO_BYTES / 1024 / 1024}MB).`,
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
        customerCandidates: customers,
        productCandidates: products,
        hint: null,
      },
    };
  }
  const ai = parsed.data;

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
        batchName: true,
        remainingQuantity: true,
        unitCost: true,
        date: true,
      },
    });

    batchCandidates = batches.map((b) => ({
      id: b.id,
      batchName: b.batchName,
      remainingQuantity: b.remainingQuantity.toString(),
      unitCost: b.unitCost ? b.unitCost.toString() : null,
      date: b.date,
    }));

    // If AI named a batch, try to match it
    if (ai.batchName) {
      const batchMatches = batches.filter(
        (b) => b.batchName?.toLowerCase() === ai.batchName!.toLowerCase()
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
  // paidAmount = what the customer paid (from AI, or 0 if not mentioned)
  // balance = totalAmount - paidAmount
  //   positive = customer owes us
  //   0 = fully paid
  //   negative = we owe the customer (overpayment)
  const paidAmount = ai.explicitPaidAmount ?? 0;
  const balance = totalAmount != null ? totalAmount - paidAmount : null;

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
      customerCandidates: customers,
      productCandidates: products,
      hint,
    },
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
      };
    }
    throw new BadRequestError("This entry was already processed but its sale no longer exists.");
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
      throw new BadRequestError("This entry is already being processed. Please wait a moment.");
    }
    throw new BadRequestError(`Session is in ${currentState} state — cannot execute.`);
  }

  // From here, we OWN this session. If anything fails, mark FAILED.
  try {
    // 4. Verify not expired
    if (isExpired(session)) {
      await prisma.smartEntrySession.update({
        where: { id: sessionId },
        data: { status: "EXPIRED", completedAt: new Date() },
      });
      throw new BadRequestError("This Smart Entry has expired. Please try again.");
    }

    // 5. Re-validate customer — MUST belong to this user
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, userId, isDeleted: false },
    });
    if (!customer) {
      throw new NotFoundError("Customer");
    }

    // 6. Re-validate product — MUST belong to this user
    const product = await prisma.product.findFirst({
      where: { id: productId, userId, isDeleted: false },
    });
    if (!product) {
      throw new NotFoundError("Product");
    }

    // 7. Validate quantity (positive number)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestError("Quantity must be a positive number.");
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
      select: { id: true, batchName: true, remainingQuantity: true, unitCost: true },
    });

    // 2. If multiple eligible batches exist, batchId is REQUIRED
    if (eligibleBatches.length > 1 && !clientBatchId) {
      throw new BadRequestError(
        "Please select a stock batch before adding to Khata. This product has multiple batches.",
      );
    }

    // 3. If batchId is provided, validate it
    let validatedBatchId: string | null = null;
    if (clientBatchId) {
      const batch = eligibleBatches.find((b) => b.id === clientBatchId);
      if (!batch) {
        throw new BadRequestError(
          "The selected batch is not available for this product or has been depleted.",
        );
      }
      // Check sufficient stock
      const remaining = toDecimalOrZero(batch.remainingQuantity);
      if (remaining.lt(quantityDec)) {
        throw new BadRequestError(
          `Batch has only ${remaining} units remaining, but sale demands ${quantityDec}.`,
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
        `Paid amount (${paidAmountDec}) cannot exceed sale total (${amount}).`,
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
// 3. CANCEL — user cancelled; mark the session CANCELLED
// ────────────────────────────────────────────────────────────────────────────

export async function cancelSession(
  userId: string,
  sessionId: string,
): Promise<{ id: string; cancelled: true }> {
  const session = await loadAndVerifySession(userId, sessionId);
  if (session.status === "COMPLETED") {
    throw new BadRequestError("Cannot cancel a completed session.");
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
    throw new NotFoundError("Smart Entry Session", sessionId);
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

async function findProductCandidates(
  userId: string,
  name: string,
): Promise<Array<{ id: string; name: string; unit: string; sellingPrice: Decimal }>> {
  const cleanName = name.trim();
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
