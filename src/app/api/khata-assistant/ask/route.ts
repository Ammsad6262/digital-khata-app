/**
 * POST /api/khata-assistant/ask
 *
 * Ask the Khata Assistant a prepared or typed business question.
 *
 * Body (exactly one of):
 *   { questionId: "top_debtors", language?: "en"|"ur" }
 *   { text: "which customers owe me the most", language?: "en"|"ur" }
 *
 * Response: { ok: true, data: KhataAnswer }
 *
 * Security:
 *   - userId comes from the session cookie (middleware), never the body.
 *   - The engine is read-only: this endpoint can never change a record.
 *   - Answers contain only this business's records.
 */

import { NextRequest } from "next/server";
import { requireActiveAccess } from "@/lib/auth/get-current-user";
import { ok, fail, parseJsonBody } from "@/lib/utils/api";
import { BadRequestError } from "@/lib/errors";
import { askKhataAssistant } from "@/lib/khata-assistant/service";
import { checkExecuteLimit } from "@/lib/smart-entry/rate-limit";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_TEXT_CHARS = 400;

type Body = {
  questionId?: unknown;
  text?: unknown;
  language?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const userId = await requireActiveAccess(req);

    const { data: body } = await parseJsonBody<Body>(req);
    if (!body) throw new BadRequestError("A request body is required.");

    const questionId =
      typeof body.questionId === "string" ? body.questionId.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (text.length > MAX_TEXT_CHARS) {
      throw new BadRequestError(
        `Question is too long (max ${MAX_TEXT_CHARS} characters).`,
      );
    }
    if (!questionId && !text) {
      throw new BadRequestError("Choose a question or type one.");
    }

    // Prepared questions are free DB reads. Only typed questions may reach the
    // AI, so only those consume the per-user budget.
    if (text) {
      const limit = checkExecuteLimit(userId);
      if (!limit.allowed) {
        throw new BadRequestError(
          `Too many questions for now. Try again in ${limit.retryAfterSec}s.`,
        );
      }
    }

    const language = typeof body.language === "string" ? body.language : undefined;

    const answer = await askKhataAssistant(userId, { questionId, text, language });
    return ok(answer);
  } catch (error) {
    return fail(error);
  }
}
