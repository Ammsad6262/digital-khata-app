/**
 * Smart Khata Entry — service layer.
 *
 * This is the "backend authority" for the Smart Khata feature. The AI is
 * an interpreter; this module is what actually:
 *   - Resolves AI-extracted names to real customer/product IDs (for the
 *     CURRENT authenticated user only — never global).
 *   - Calculates the amount using the real product.sellingPrice from the DB.
 *   - Creates + manages SmartEntrySession rows.
 *   - Re-validates everything before executing (defends against stale sessions,
 *     manipulated client requests, deleted customers/products, etc.).
 *
 * The execute() method calls the EXISTING SaleService.createSale() — there
 * is no separate AI-only transaction path. The AI is just a fancy input
 * method that ultimately feeds the same trusted code path as the manual
 * sale form.
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

/** Sessions expire after 5 minutes — user must confirm within this window. */
const SESSION_TTL_MS = 5 * 60 * 1000;

/** Maximum audio length we accept (30 seconds at 32 tokens/sec ≈ 960 tokens). */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB hard cap

/** Safely cast an AiInterpretation to Prisma's JSON input type. */
function aiToPrismaJson(ai: AiInterpretation): Prisma.InputJsonValue {
  return ai as unknown as Prisma.InputJsonValue;
}

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export type InterpretResult = {
  sessionId: string;
  status: InterpretStatus;
  transcript: string | null;
  // For READY state — what to show in the confirmation UI:
  preview?: {
    intent: string;
    customerName: string;
    productName: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    amount: string;
    customerId: string;
    productId: string;
  };
  // For AMBIGUOUS_* states — what to show in the picker:
  candidates?: EntityCandidate[];
  // For CLARIFICATION_NEEDED / *_NOT_FOUND / UNSUPPORTED_INTENT / FAILED:
  message?: string;
  // Raw AI confidence (informational, 0..1)
  confidence?: number;
};

export type ExecuteResult = {
  saleId: string;
  totalAmount: string;
  outstanding: string;
};

// ────────────────────────────────────────────────────────────────────────────
// 1. INTERPRET — text or audio → SmartEntrySession
// ────────────────────────────────────────────────────────────────────────────

/**
 * Process a text or voice input from the user.
 *
 * Steps:
 *   1. Authenticate (caller passes the verified userId — never trust client)
 *   2. Build AIContext from this user's customer/product names (NO IDs sent)
 *   3. Call the AI provider (Gemini)
 *   4. Validate the AI output against the Zod schema
 *   5. Resolve customerName → real Customer ID (THIS user's records only)
 *   6. Resolve productName → real Product ID (THIS user's records only)
 *   7. Calculate amount = quantity × product.sellingPrice (server-side)
 *   8. Create a SmartEntrySession row storing the RESOLVED IDs (not the AI's names)
 *   9. Return InterpretResult with status + preview/candidates/message
 */
export async function interpretInput(
  userId: string,
  input:
    | { type: "text"; text: string }
    | { type: "audio"; audio: Uint8Array; mimeType: string },
): Promise<InterpretResult> {
  // 2. Build context (names only — never IDs)
  const context = await buildAIContext(userId);

  // 3. Call AI
  //    (If the AI provider isn't configured — e.g. GEMINI_API_KEY missing —
  //    return a friendly FAILED status instead of crashing with 500.)
  let provider;
  try {
    provider = getAIProvider();
  } catch (err) {
    if (err instanceof AIUnavailableError) {
      console.error("[smart-entry] AI provider unavailable:", err.message);
      const session = await prisma.smartEntrySession.create({
        data: {
          userId,
          status: "FAILED",
          inputType: input.type,
          transcript: input.type === "text" ? input.text : null,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
      return {
        sessionId: session.id,
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
      transcript = input.text; // for text input, the user's text IS the transcript
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
    // AI failed — return a friendly error, log the details server-side
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[smart-entry] AI provider error:", errMsg);

    // Detect common Gemini geo-restriction error and give a clear message
    // (happens when the dev/test server is in an unsupported region like HK).
    // Production deployments on Vercel (US region) and users in Pakistan
    // won't hit this — it's a dev-environment-only issue.
    const isGeoBlocked = errMsg.includes("User location is not supported");
    const userMessage = isGeoBlocked
      ? "AI service is unavailable in this region. Try again from a supported location."
      : "Sorry, I couldn't understand that. Please try again, or enter it manually.";

    // Still create a session row for audit
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "FAILED",
        inputType: input.type,
        transcript: input.type === "text" ? input.text : null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: "FAILED",
      transcript: input.type === "text" ? input.text : null,
      message: userMessage,
    };
  }

  // 4. (Zod validation already happened in the provider — re-validate here
  //    for defense-in-depth)
  const parsed = aiInterpretationSchema.safeParse(interpretation);
  if (!parsed.success) {
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "FAILED",
        inputType: input.type,
        transcript,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: "FAILED",
      transcript,
      message: "Sorry, I couldn't parse that. Please try again.",
    };
  }
  const ai = parsed.data;

  // 5. Handle UNKNOWN intent
  if (ai.intent === "UNKNOWN" || ai.needsClarification) {
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "CLARIFICATION_NEEDED",
        inputType: input.type,
        transcript,
        rawAiResponse: aiToPrismaJson(ai),
        intent: ai.intent,
        customerNameRaw: ai.customerName,
        productNameRaw: ai.productName,
        quantityRaw: ai.quantity ?? null,
        unitRaw: ai.unit ?? null,
        provider: provider.name,
        confidence: ai.confidence ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: ai.intent === "UNKNOWN" ? "UNSUPPORTED_INTENT" : "CLARIFICATION_NEEDED",
      transcript,
      message:
        ai.clarificationQuestion ??
        (ai.intent === "UNKNOWN"
          ? "I can only handle credit sales (udhaar) right now. Try: 'Ahmad ne 25 kilo chawal liya'."
          : "Could you clarify that?"),
      confidence: ai.confidence,
    };
  }

  // 6. Validate required fields are present
  if (!ai.customerName) {
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "CLARIFICATION_NEEDED",
        inputType: input.type,
        transcript,
        rawAiResponse: aiToPrismaJson(ai),
        intent: ai.intent,
        provider: provider.name,
        confidence: ai.confidence ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: "CLARIFICATION_NEEDED",
      transcript,
      message: "Which customer was this for? Please mention their name.",
    };
  }

  if (!ai.productName) {
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "CLARIFICATION_NEEDED",
        inputType: input.type,
        transcript,
        rawAiResponse: aiToPrismaJson(ai),
        intent: ai.intent,
        customerNameRaw: ai.customerName,
        provider: provider.name,
        confidence: ai.confidence ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: "CLARIFICATION_NEEDED",
      transcript,
      message: "What product was this? Please mention the product name.",
    };
  }

  if (!ai.quantity || ai.quantity <= 0) {
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "CLARIFICATION_NEEDED",
        inputType: input.type,
        transcript,
        rawAiResponse: aiToPrismaJson(ai),
        intent: ai.intent,
        customerNameRaw: ai.customerName,
        productNameRaw: ai.productName,
        provider: provider.name,
        confidence: ai.confidence ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: "CLARIFICATION_NEEDED",
      transcript,
      message: `How much ${ai.productName} did you give ${ai.customerName}?`,
    };
  }

  // 7. Resolve customer + product against THIS USER's records
  const customerMatches = await findCustomerCandidates(userId, ai.customerName);
  const productMatches = await findProductCandidates(userId, ai.productName);

  // 7a. Customer not found
  if (customerMatches.length === 0) {
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "FAILED",
        inputType: input.type,
        transcript,
        rawAiResponse: aiToPrismaJson(ai),
        intent: ai.intent,
        customerNameRaw: ai.customerName,
        productNameRaw: ai.productName,
        quantityRaw: ai.quantity,
        unitRaw: ai.unit ?? null,
        provider: provider.name,
        confidence: ai.confidence ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: "CUSTOMER_NOT_FOUND",
      transcript,
      message: `I couldn't find a customer named "${ai.customerName}" in your Khata. Want to add them first?`,
      candidates: [],
    };
  }

  // 7b. Product not found
  if (productMatches.length === 0) {
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "FAILED",
        inputType: input.type,
        transcript,
        rawAiResponse: aiToPrismaJson(ai),
        intent: ai.intent,
        customerNameRaw: ai.customerName,
        productNameRaw: ai.productName,
        quantityRaw: ai.quantity,
        unitRaw: ai.unit ?? null,
        provider: provider.name,
        confidence: ai.confidence ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: "PRODUCT_NOT_FOUND",
      transcript,
      message: `I couldn't find a product matching "${ai.productName}" in your inventory.`,
      candidates: [],
    };
  }

  // 7c. Ambiguous customer (2+ matches) — ask user to pick
  if (customerMatches.length > 1) {
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "INTERPRETING",
        inputType: input.type,
        transcript,
        rawAiResponse: aiToPrismaJson(ai),
        intent: ai.intent,
        customerNameRaw: ai.customerName,
        productNameRaw: ai.productName,
        quantityRaw: ai.quantity,
        unitRaw: ai.unit ?? null,
        provider: provider.name,
        confidence: ai.confidence ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: "AMBIGUOUS_CUSTOMER",
      transcript,
      message: `Multiple customers match "${ai.customerName}". Please choose:`,
      candidates: customerMatches.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone ?? null,
      })),
    };
  }

  // 7d. Ambiguous product (2+ matches) — ask user to pick
  if (productMatches.length > 1) {
    const session = await prisma.smartEntrySession.create({
      data: {
        userId,
        status: "INTERPRETING",
        inputType: input.type,
        transcript,
        rawAiResponse: aiToPrismaJson(ai),
        intent: ai.intent,
        customerNameRaw: ai.customerName,
        productNameRaw: ai.productName,
        quantityRaw: ai.quantity,
        unitRaw: ai.unit ?? null,
        provider: provider.name,
        confidence: ai.confidence ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return {
      sessionId: session.id,
      status: "AMBIGUOUS_PRODUCT",
      transcript,
      message: `Multiple products match "${ai.productName}". Please choose:`,
      candidates: productMatches.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        sellingPrice: p.sellingPrice.toString(),
      })),
    };
  }

  // 8. EXACTLY ONE customer + ONE product match → compute amount + create session
  const customer = customerMatches[0]!;
  const product = productMatches[0]!;
  const quantity = new Decimal(ai.quantity);
  const unitPrice = toDecimal(product.sellingPrice);
  const amount = quantity.times(unitPrice);

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
      quantityRaw: ai.quantity,
      unitRaw: ai.unit ?? null,
      resolvedCustomerId: customer.id,
      resolvedProductId: product.id,
      resolvedUnit: product.unit,
      resolvedQuantity: ai.quantity,
      resolvedUnitPrice: unitPrice,
      resolvedAmount: amount,
      provider: provider.name,
      confidence: ai.confidence ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return {
    sessionId: session.id,
    status: "READY",
    transcript,
    preview: {
      intent: ai.intent,
      customerName: customer.name,
      productName: product.name,
      quantity: ai.quantity.toString(),
      unit: product.unit,
      unitPrice: unitPrice.toString(),
      amount: amount.toString(),
      customerId: customer.id,
      productId: product.id,
    },
    confidence: ai.confidence,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. RESOLVE DISAMBIGUATION — for AMBIGUOUS_* sessions, after the user picks
// ────────────────────────────────────────────────────────────────────────────

/**
 * After the user picks a customer (or product) from the disambiguation
 * picker, this method re-resolves the session with their choice and moves
 * it to AWAITING_CONFIRMATION (or returns an error if the choice is invalid).
 */
export async function resolveDisambiguation(
  userId: string,
  sessionId: string,
  chosen: { customerId?: string; productId?: string },
): Promise<InterpretResult> {
  const session = await loadAndVerifySession(userId, sessionId);

  // The session must be in INTERPRETING (the AMBIGUOUS_* state from the client
  // perspective stores status="INTERPRETING" in the DB — see the comment in
  // interpretInput above).
  if (session.status !== "INTERPRETING") {
    throw new BadRequestError(
      `Session is in ${session.status} state, cannot resolve disambiguation.`,
    );
  }

  if (isExpired(session)) {
    await prisma.smartEntrySession.update({
      where: { id: sessionId },
      data: { status: "EXPIRED" },
    });
    throw new BadRequestError("This Smart Entry has expired. Please try again.");
  }

  // If the user picked a customer, validate it belongs to them
  let customer;
  if (chosen.customerId) {
    customer = await prisma.customer.findFirst({
      where: {
        id: chosen.customerId,
        userId,
        isDeleted: false,
      },
    });
    if (!customer) {
      throw new NotFoundError("Customer", chosen.customerId);
    }
  } else if (session.resolvedCustomerId) {
    customer = await prisma.customer.findFirst({
      where: { id: session.resolvedCustomerId, userId, isDeleted: false },
    });
    if (!customer) {
      throw new NotFoundError("Customer", session.resolvedCustomerId);
    }
  } else {
    throw new BadRequestError("No customer was resolved. Please re-try.");
  }

  // Same for product
  let product;
  if (chosen.productId) {
    product = await prisma.product.findFirst({
      where: {
        id: chosen.productId,
        userId,
        isDeleted: false,
      },
    });
    if (!product) {
      throw new NotFoundError("Product", chosen.productId);
    }
  } else if (session.resolvedProductId) {
    product = await prisma.product.findFirst({
      where: { id: session.resolvedProductId, userId, isDeleted: false },
    });
    if (!product) {
      throw new NotFoundError("Product", session.resolvedProductId);
    }
  } else {
    throw new BadRequestError("No product was resolved. Please re-try.");
  }

  // Compute amount with the resolved product's CURRENT sellingPrice
  // (defends against price changes since the session was created)
  const quantity = toDecimalOrZero(session.quantityRaw);
  const unitPrice = toDecimal(product.sellingPrice);
  const amount = quantity.times(unitPrice);

  await prisma.smartEntrySession.update({
    where: { id: sessionId },
    data: {
      status: "AWAITING_CONFIRMATION",
      resolvedCustomerId: customer.id,
      resolvedProductId: product.id,
      resolvedUnit: product.unit,
      resolvedQuantity: session.quantityRaw,
      resolvedUnitPrice: unitPrice,
      resolvedAmount: amount,
    },
  });

  return {
    sessionId,
    status: "READY",
    transcript: session.transcript,
    preview: {
      intent: session.intent ?? "CREATE_CREDIT_SALE",
      customerName: customer.name,
      productName: product.name,
      quantity: quantity.toString(),
      unit: product.unit,
      unitPrice: unitPrice.toString(),
      amount: amount.toString(),
      customerId: customer.id,
      productId: product.id,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. EXECUTE — user confirmed; create the actual Sale
// ────────────────────────────────────────────────────────────────────────────

/**
 * Execute a confirmed SmartEntrySession.
 *
 * This is the CRITICAL security boundary. Despite the user confirming,
 * we MUST:
 *   1. Re-authenticate (caller passes verified userId — never client)
 *   2. Atomically transition the session from AWAITING_CONFIRMATION → EXECUTING
 *      using a conditional UPDATE (WHERE status = 'AWAITING_CONFIRMATION').
 *      This prevents double-execution race conditions: if two concurrent
 *      requests arrive (e.g. user double-clicked "Add to Khata"), only
 *      one will succeed in flipping the status; the other gets count=0
 *      and we return an "already executing/completed" error.
 *   3. Verify not expired
 *   4. Re-resolve customer + product against the CURRENT DB (they may have
 *      been deleted, or their price may have changed, since interpretation)
 *   5. Recompute the amount (DON'T trust the cached resolvedAmount)
 *   6. Call the EXISTING SaleService.createSale() — the SAME path the
 *      manual sale form uses. No AI-specific transaction logic.
 *   7. Mark session COMPLETED with the createdSaleId.
 *
 * The client sends ONLY { sessionId } (+ optional chosenCustomerId/Product
 * for disambiguation flow). It CANNOT inject amount, customer ID, or
 * product ID — those come from the session row.
 */
export async function executeSession(
  userId: string,
  sessionId: string,
  chosen?: { customerId?: string; productId?: string },
): Promise<ExecuteResult> {
  // If the user picked a customer/product during disambiguation, resolve
  // that first.
  if (chosen?.customerId || chosen?.productId) {
    await resolveDisambiguation(userId, sessionId, chosen);
  }

  // 1. Load + verify session belongs to this user
  const session = await loadAndVerifySession(userId, sessionId);

  // 2. Handle already-terminal states gracefully (idempotency).
  //    If the session is already COMPLETED, return the existing sale info
  //    instead of erroring — this is the "duplicate request after success"
  //    case (user refreshed the page after confirming).
  if (session.status === "COMPLETED" && session.createdSaleId) {
    // Fetch the sale to return its totals
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
    // Sale was deleted — fall through to error
    throw new BadRequestError("This entry was already processed but its sale no longer exists.");
  }

  // 3. Atomically claim the session: only proceed if status is still
  //    AWAITING_CONFIRMATION. This is the duplicate-execution guard.
  //    Two concurrent requests will both try this UPDATE; only one will
  //    affect a row (the other will get count=0 because the status is
  //    no longer AWAITING_CONFIRMATION).
  const claimed = await prisma.smartEntrySession.updateMany({
    where: {
      id: sessionId,
      userId, // tenant isolation even on the claim
      status: "AWAITING_CONFIRMATION",
    },
    data: { status: "EXECUTING", updatedAt: new Date() },
  });

  if (claimed.count === 0) {
    // Someone else (or this same request earlier) already claimed it.
    // Re-read to give the user a meaningful message.
    const current = await prisma.smartEntrySession.findFirst({
      where: { id: sessionId, userId },
      select: { status: true },
    });
    const currentState = current?.status ?? "UNKNOWN";
    if (currentState === "EXECUTING") {
      // Another request is mid-flight. Tell the user to wait — don't create
      // a duplicate sale.
      throw new BadRequestError("This entry is already being processed. Please wait a moment.");
    }
    throw new BadRequestError(
      `Session is in ${currentState} state — cannot execute.`,
    );
  }

  // From here, we OWN this session. If anything fails, we must transition
  // it to FAILED so it can't be re-executed (idempotency on failure too).
  try {
    // 4. Verify not expired (we claimed it, but it might have expired
    //    between status check and claim). Mark EXPIRED specifically so
    //    the user sees "expired" in their session history rather than "failed".
    if (isExpired(session)) {
      await prisma.smartEntrySession.update({
        where: { id: sessionId },
        data: { status: "EXPIRED", completedAt: new Date() },
      });
      throw new BadRequestError("This Smart Entry has expired. Please try again.");
    }

    // 5. Re-resolve customer + product (defense against deletion since interpret)
    const customer = await prisma.customer.findFirst({
      where: {
        id: session.resolvedCustomerId ?? undefined,
        userId,
        isDeleted: false,
      },
    });
    if (!customer) {
      throw new NotFoundError("Customer");
    }

    const product = await prisma.product.findFirst({
      where: {
        id: session.resolvedProductId ?? undefined,
        userId,
        isDeleted: false,
      },
    });
    if (!product) {
      throw new NotFoundError("Product");
    }

    // 6. Recompute amount with the CURRENT product price (DON'T trust cached)
    const quantity = toDecimalOrZero(session.quantityRaw);
    const unitPrice = toDecimal(product.sellingPrice);
    const amount = quantity.times(unitPrice);

    // 7. Call existing SaleService.createSale() — the trusted path.
    //    paidAmount = 0 (this is a CREDIT sale; V1 doesn't support paying
    //    at sale time via Smart Entry).
    const sale = await createSale(
      {
        customerId: customer.id,
        items: [
          {
            productId: product.id,
            quantity: quantity.toNumber(),
            unitPrice: unitPrice.toNumber(),
          },
        ],
        paidAmount: 0,
        paymentMethod: "cash",
      },
      userId,
    );

    // 8. Mark session COMPLETED + link to created sale
    await prisma.smartEntrySession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        createdSaleId: sale.id,
        resolvedCustomerId: customer.id,
        resolvedProductId: product.id,
        resolvedUnit: product.unit,
        resolvedQuantity: quantity,
        resolvedUnitPrice: unitPrice,
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
    // Mark the session FAILED so it can't be re-executed (idempotent on failure).
    // BUT: if the error is the expiry-related BadRequestError we threw above,
    // the session is ALREADY marked EXPIRED — don't overwrite it.
    if (error instanceof BadRequestError && error.message.includes("expired")) {
      throw error; // session already EXPIRED, just re-throw
    }
    await prisma.smartEntrySession.update({
      where: { id: sessionId },
      data: { status: "FAILED", completedAt: new Date() },
    }).catch(() => { /* ignore — original error is more important */ });
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 4. CANCEL — user cancelled; mark the session CANCELLED
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

/** Load a session and verify it belongs to the authenticated user. */
async function loadAndVerifySession(userId: string, sessionId: string) {
  const session = await prisma.smartEntrySession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) {
    throw new NotFoundError("Smart Entry Session", sessionId);
  }
  return session;
}

/** Has the session exceeded its TTL? */
function isExpired(session: { expiresAt: Date }): boolean {
  return session.expiresAt.getTime() < Date.now();
}

/**
 * Build the AIContext: customer names + product names + units for the
 * CURRENT user only. NO IDs, NO prices, NO balances are sent to the AI.
 *
 * We cap at 100 customers/products by recency (createdAt desc) — covers
 * 95%+ of cases without bloating the prompt.
 */
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

/**
 * Find customer candidates matching a name (case-insensitive, prefix match).
 *
 * Returns 0 (no match), 1 (exact match — proceed), or 2+ (ambiguous — picker).
 *
 * The matching strategy is deliberately SIMPLE for V1:
 *   1. Case-insensitive exact match
 *   2. Case-insensitive "starts with" match (covers "Ahmad" → "Ahmad Khan")
 *   3. Case-insensitive "contains" match (covers "khan" → "Imran Khan")
 *
 * We do NOT use Postgres pg_trgm fuzzy matching yet — it's a V2 enhancement.
 * The AI is responsible for normalizing "احمد" → "Ahmad" etc. via the prompt.
 */
async function findCustomerCandidates(
  userId: string,
  name: string,
): Promise<Array<{ id: string; name: string; phone: string | null }>> {
  const cleanName = name.trim();
  if (!cleanName) return [];

  // Try exact match first (case-insensitive)
  const exact = await prisma.customer.findMany({
    where: {
      userId,
      isDeleted: false,
      name: { equals: cleanName, mode: "insensitive" },
    },
    select: { id: true, name: true, phone: true },
    take: 6,
  });
  if (exact.length > 0) return exact;

  // Fall back to "starts with" — covers "Ahmad" → "Ahmad Khan"
  const startsWith = await prisma.customer.findMany({
    where: {
      userId,
      isDeleted: false,
      name: { startsWith: cleanName, mode: "insensitive" },
    },
    select: { id: true, name: true, phone: true },
    take: 6,
  });
  if (startsWith.length > 0) return startsWith;

  // Fall back to "contains" — covers "khan" → "Imran Khan"
  const contains = await prisma.customer.findMany({
    where: {
      userId,
      isDeleted: false,
      name: { contains: cleanName, mode: "insensitive" },
    },
    select: { id: true, name: true, phone: true },
    take: 6,
  });
  return contains;
}

/**
 * Find product candidates — same strategy as findCustomerCandidates.
 */
async function findProductCandidates(
  userId: string,
  name: string,
): Promise<Array<{ id: string; name: string; unit: string; sellingPrice: Decimal }>> {
  const cleanName = name.trim();
  if (!cleanName) return [];

  const exact = await prisma.product.findMany({
    where: {
      userId,
      isDeleted: false,
      name: { equals: cleanName, mode: "insensitive" },
    },
    select: { id: true, name: true, unit: true, sellingPrice: true },
    take: 6,
  });
  if (exact.length > 0) return exact;

  const startsWith = await prisma.product.findMany({
    where: {
      userId,
      isDeleted: false,
      name: { startsWith: cleanName, mode: "insensitive" },
    },
    select: { id: true, name: true, unit: true, sellingPrice: true },
    take: 6,
  });
  if (startsWith.length > 0) return startsWith;

  const contains = await prisma.product.findMany({
    where: {
      userId,
      isDeleted: false,
      name: { contains: cleanName, mode: "insensitive" },
    },
    select: { id: true, name: true, unit: true, sellingPrice: true },
    take: 6,
  });
  return contains;
}
