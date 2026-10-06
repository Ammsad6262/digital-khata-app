/**
 * POST /api/smart-entry/interpret
 *
 * Body:
 *   { text: "Ahmad ne 25 kilo chawal liya" }
 *   OR
 *   { audio: { base64: "...", mimeType: "audio/webm" } }
 *
 * Response:
 *   { ok: true, data: InterpretResult }
 *
 * The InterpretResult tells the client what to show next:
 *   - status=READY → show confirmation preview
 *   - status=AMBIGUOUS_CUSTOMER → show customer picker
 *   - status=AMBIGUOUS_PRODUCT → show product picker
 *   - status=CLARIFICATION_NEEDED → show question + re-record button
 *   - status=CUSTOMER_NOT_FOUND / PRODUCT_NOT_FOUND → show "not found" UI
 *   - status=UNSUPPORTED_INTENT → "I can only handle credit sales right now"
 *   - status=FAILED → "Sorry, I couldn't understand that"
 *
 * Security:
 *   - userId derived from JWT cookie (NEVER from request body)
 *   - Rate-limited per user (20 interpretations/hour)
 *   - Audio capped at 5MB
 *   - Text capped at 500 chars (Zod)
 *   - AI output validated against strict Zod schema
 *   - AI never receives IDs, prices, balances — only customer/product NAMES
 */

import { NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError, AppError, ErrorCode } from "@/lib/errors";
import { interpretInput } from "@/lib/smart-entry/service";
import { checkInterpretLimit } from "@/lib/smart-entry/rate-limit";
import { interpretRequestSchema } from "@/lib/smart-entry/schema";

// Force dynamic — this route always processes a body, never cached
export const dynamic = "force-dynamic";

// Allow larger bodies for audio uploads (5MB)
export const fetchCache = "force-no-store";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const userId = await requireUserId(req);

    // 2. Rate limit
    const limit = checkInterpretLimit(userId);
    if (!limit.allowed) {
      throw new AppError(
        `Too many Smart Entry requests. Try again in ${limit.retryAfterSec}s.`,
        ErrorCode.BAD_REQUEST,
        429,
      );
    }

    // 3. Parse + validate body
    const { data, error } = await parseJsonBody<unknown>(req);
    if (error || !data) {
      throw new BadRequestError(error || "Invalid request body.");
    }

    const parsed = interpretRequestSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestError(
        `Invalid request: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        parsed.error.issues,
      );
    }

    // 4. Build input for the service layer
    if (parsed.data.text) {
      const result = await interpretInput(userId, {
        type: "text",
        text: parsed.data.text,
      });
      return ok(result);
    }

    // Audio path
    const { base64, mimeType } = parsed.data.audio!;
    // Validate size before decoding (cheap check on string length)
    // Base64 expands by ~4/3, so length×0.75 ≈ byte count
    if (base64.length * 0.75 > MAX_AUDIO_BYTES) {
      throw new BadRequestError(
        `Audio too large (max ${MAX_AUDIO_BYTES / 1024 / 1024}MB).`,
      );
    }

    const audioBytes = Uint8Array.from(Buffer.from(base64, "base64"));
    const result = await interpretInput(userId, {
      type: "audio",
      audio: audioBytes,
      mimeType,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
